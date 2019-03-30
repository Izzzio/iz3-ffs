/**
 * IZZZIO FFS - Fast File Sharing tool
 *
 */

const NODE_LIST = ["ws://176.9.104.200:6031"];
const CHUNK_SIZE = 50000;//1000000;
const MESSAGES_TYPES = {
    handshake: 'HANDSHAKE',
    startFile: 'STARTFILE',
    sendChunk: 'CHUNK',
    chunkRecivied: 'OK',
    invalidChunk: 'INVALIDCHUNK'
};


//***************************
let candy;
let currentFile;
let currentConnection = '';
let writerStream;
let lastInputChunk = -1;

/**
 * Get file part by chunk no
 * @param file
 * @param chunkNo
 * @param cb
 */
function getFilePart(file, chunkNo, cb) {
    let reader = new FileReader();
    reader.onloadend = function (evt) {
        if(evt.target.readyState === FileReader.DONE) {
            cb(evt.target.result);
        }
    };

    let chunkEnd = (chunkNo * CHUNK_SIZE) + CHUNK_SIZE;
    if(chunkEnd > file.size) {
        chunkEnd = file.size;
    }
    let blob = file.slice(chunkNo * CHUNK_SIZE, chunkEnd);
    reader.readAsArrayBuffer(blob);
}

/**
 * Make share url
 * @return {string}
 */
function makeShareUrl() {
    window.location.hash = candy.recieverAddress;
    let url = window.location.href;
    window.location.hash = '';
    return url;
}

/**
 * Starting transfer
 * @param file
 */
function startTransfer(file) {
    console.log(file);
    $('#uploadPrompt').hide();
    $('#shareLinkPrompt').show(500);
    $('#shareLinkUrl').val(makeShareUrl());
    currentFile = {file: file, reader: new FileReader(), currentChunk: 0, maxChunks: Math.ceil(file.size / CHUNK_SIZE)};

}

/**
 * Handle file select
 * @param evt
 */
function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    let event = evt;
    if(evt.originalEvent) {
        event = evt.originalEvent;
    }


    let files;
    if(event.dataTransfer) {
        files = event.dataTransfer.files;
    } else {
        files = event.target.files;
    }


    startTransfer(files[0]);

}

/**
 * Handle dragover
 * @param evt
 */
function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    /*if(evt.originalEvent) {
        evt = evt.originalEvent;
    }*/


    if(evt.dataTransfer) {
        evt.dataTransfer.dropEffect = 'copy';
    }
}


/**
 * Init downloading
 */
function startDownloading() {
    let from = window.location.hash.replace('#', '');
    $('#uploadPrompt').hide();
    $('#downloadingScreen').show(500);
    sendMessage(from, {handshake: 'hello'}, MESSAGES_TYPES.handshake);
    candy.starwave.registerMessageHandler(MESSAGES_TYPES.startFile, function (message) {
        $('.waitingForConnection').hide(500);
        $('#fileSize').text(utils.humanFileSize(message.data.size, true));
        $('#fileName').text(message.data.filename);

        const fileStream = streamSaver.createWriteStream(message.data.filename, message.data.size);
        writerStream = fileStream.getWriter();
    });

    candy.starwave.registerMessageHandler(MESSAGES_TYPES.sendChunk, function (message) {

        if(message.data.chunk > lastInputChunk + 1 || message.data.chunk < lastInputChunk || message.data.chunk === lastInputChunk) {
            console.log(new Error('Invalid chunk'), message.data.chunk, lastInputChunk);
            sendMessage(from, {chunk: lastInputChunk}, MESSAGES_TYPES.invalidChunk);
            return;
        }

        $('#currentChunkDownload').text(message.data.chunk + '/' + message.data.totalChunks);
        lastInputChunk = message.data.chunk;
        if(message.data.data) {
            writerStream.write(new Uint8Array(utils.decompressArray(message.data.data)));
        }

        sendMessage(from, {chunk: lastInputChunk}, MESSAGES_TYPES.chunkRecivied);
        setProgess(message.data.chunk, message.data.totalChunks);

        if(message.data.chunk >= message.data.totalChunks) {
            sendingComplete();
            writerStream.close();
        }
    });

}

/**
 * Send chunk
 * @param chunk
 * @param cb
 */
function sendChunk(chunk, cb) {
    getFilePart(currentFile.file, chunk, function (data) {
        sendMessage(currentConnection, {
            chunk: chunk,
            totalChunks: currentFile.maxChunks,
            data: data.byteLength !== 0 ? utils.compressArray(Array.from(new Uint8Array(data))) : ''
        }, MESSAGES_TYPES.sendChunk);
        if(cb) {
            cb();
        }
    });
}

/**
 * Send next chunk
 */
function nextChunk() {
    sendChunk(currentFile.currentChunk, function () {
        setTimeout(function () {
            /*currentFile.currentChunk++;
            if(currentFile.currentChunk <= currentFile.maxChunks) {
                nextChunk();
            }*/
        }, 1);
    });
}

/**
 * Show complete screen
 */
function sendingComplete() {
    $('#downloadingScreen').hide();
    $('#shareLinkPrompt').hide();
    $('#completeScreen').show(500);

}

/**
 * Set progress bar
 * @param val
 * @param max
 */
function setProgess(val, max) {
    let progress = (val / max) * 100;
    $('.progressBar .bar').css('width', progress + '%');
}

/**
 * Send message through starwave
 * @param to
 * @param message
 * @param id
 */
function sendMessage(to, message, id) {
    let msg = candy.starwave.createMessage(message, to, undefined, id);
    candy.starwave.sendMessage(msg);
}


$(document).ready(function () {
    candy = new Candy(NODE_LIST);

    candy.start();

    candy.onready = function () {
        if(window.location.hash.length > 0) {
            startDownloading();
        }
        $('#upload').removeClass('disabled');
        $('#download').removeClass('disabled');
    };

    $('#upload').click(function () {
        $('#file').click();
    });

    $('#dropZone').on('dragover', handleDragOver);
    $('#dropZone').on('drop', handleFileSelect);
    $('#file').on('change', handleFileSelect);
    $('#uploadUpdate').click(function () {
        window.location.hash = '';
        window.location.reload();
    });

    candy.starwave.registerMessageHandler(MESSAGES_TYPES.handshake, function (message) {
        if(currentConnection.length !== 0) {
            return;
        }
        currentConnection = message.sender;
        sendMessage(currentConnection, {
            size: currentFile.file.size,
            filename: currentFile.file.name
        }, MESSAGES_TYPES.startFile);
        $('.waitingForConnection').hide(500);
        setTimeout(function () {
            nextChunk();
        }, 1000);
    });

    candy.starwave.registerMessageHandler(MESSAGES_TYPES.invalidChunk, function (message) {
        console.log('FIX CHUNK', currentFile.currentChunk, message.data.chunk);
        currentFile.currentChunk = message.data.chunk - 1;
        nextChunk();
    });

    candy.starwave.registerMessageHandler(MESSAGES_TYPES.chunkRecivied, function (message) {
        currentFile.currentChunk++;
        setProgess(message.data.chunk, currentFile.maxChunks);
        if(message.data.chunk >= currentFile.maxChunks) {
            sendingComplete();
        } else {
            nextChunk();
        }
    });

});


//Utils

const utils = {
    compressArray: function (array) {
        let hexStr = this.createHexString(array);
        return this.hexString2Unicode(hexStr);
    },
    decompressArray: function (str) {
        let hexString = this.unicode2HexString(str);
        return this.parseHexString(hexString);
    },
    /**
     * Convert hex number string to utf-16
     * @param str
     * @return {*}
     */
    hexString2Unicode: function (str) {

        if(str.length % 4 !== 0) {
            return false;
        }

        str = str.toLowerCase();
        let code = '';
        str = str.match(/.{1,4}/g);
        for (let s of str) {
            if(s.length === 4) {
                code += String.fromCharCode(parseInt(s, 16));
            } else {
                code += s;
            }
        }

        return code;
    },
    /**
     * Convert utf-16 string to hex
     * @param uniStr
     * @return {string}
     */
    unicode2HexString: function (uniStr) {
        let str = '';
        for (let i = 0; i < uniStr.length; i++) {
            let charCode = uniStr.charCodeAt(i);
            if(charCode < 0x1000) {
                str += '0';
            }
            if(charCode < 0x100) {
                str += '0';
            }
            if(charCode < 0x10) {
                str += '0';
            }
            str += charCode.toString(16);
        }

        return str;
    },
    parseHexString: function (str) {
        var result = [];
        while (str.length >= 4) {
            result.push(parseInt(str.substring(0, 4), 16));

            str = str.substring(4, str.length);
        }

        return result;
    }
    ,
    createHexString: function (arr) {
        var result = "";
        var z;

        for (var i = 0; i < arr.length; i++) {
            var str = arr[i].toString(16);

            z = 4 - str.length + 1;
            str = Array(z).join("0") + str;

            result += str;
        }

        return result;
    },
    humanFileSize: function (bytes, si) {
        var thresh = si ? 1000 : 1024;
        if(Math.abs(bytes) < thresh) {
            return bytes + ' B';
        }
        var units = si
            ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
            : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
        var u = -1;
        do {
            bytes /= thresh;
            ++u;
        } while (Math.abs(bytes) >= thresh && u < units.length - 1);
        return bytes.toFixed(1) + ' ' + units[u];
    }
};

