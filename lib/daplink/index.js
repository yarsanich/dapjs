"use strict";
/*
* DAPjs
* Copyright Arm Limited 2018
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var proxy_1 = require("../proxy");
/**
 * @hidden
 */
var DEFAULT_BAUDRATE = 9600;
/**
 * @hidden
 */
var DEFAULT_SERIAL_DELAY = 200;
/**
 * @hidden
 */
var DEFAULT_PAGE_SIZE = 62;
/**
 * DAPLink Class
 */
var DAPLink = /** @class */ (function (_super) {
    __extends(DAPLink, _super);
    function DAPLink() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.timer = null;
        return _this;
    }
    /**
     * Detect if buffer contains text or binary data
     */
    DAPLink.prototype.isBufferBinary = function (buffer) {
        var bufferString = String.fromCharCode.apply(null, new Uint16Array(buffer, 0, 50));
        for (var i = 0; i < bufferString.length; i++) {
            var charCode = bufferString.charCodeAt(i);
            // 65533 is a code for unknown character
            // 0-8 are codes for control characters
            if (charCode === 65533 || charCode <= 8) {
                return true;
            }
        }
        return false;
    };
    DAPLink.prototype.writeBuffer = function (buffer, pageSize, offset) {
        var _this = this;
        if (offset === void 0) { offset = 0; }
        var end = Math.min(buffer.byteLength, offset + pageSize);
        var page = buffer.slice(offset, end);
        var data = new Uint8Array(page.byteLength + 1);
        data.set([page.byteLength]);
        data.set(new Uint8Array(page), 1);
        return this.send(140 /* WRITE */, data)
            .then(function () {
            _this.emit(DAPLink.EVENT_PROGRESS, offset / buffer.byteLength);
            if (end < buffer.byteLength) {
                return _this.writeBuffer(buffer, pageSize, end);
            }
        });
    };
    /**
     * Flash the target
     * @param buffer The image to flash
     * @param pageSize The page size to use (defaults to 62)
     * @returns Promise
     */
    DAPLink.prototype.flash = function (buffer, pageSize) {
        var _this = this;
        if (pageSize === void 0) { pageSize = DEFAULT_PAGE_SIZE; }
        function isView(source) {
            return source.buffer !== undefined;
        }
        var arrayBuffer = isView(buffer) ? buffer.buffer : buffer;
        var streamType = this.isBufferBinary(arrayBuffer) ? 0 : 1;
        return this.send(138 /* OPEN */, new Uint32Array([streamType]))
            .then(function (result) {
            // An error occurred
            if (result.getUint8(1) !== 0)
                return;
            return _this.writeBuffer(arrayBuffer, pageSize);
        })
            .then(function () {
            _this.emit(DAPLink.EVENT_PROGRESS, 1.0);
            return _this.send(139 /* CLOSE */);
        })
            .then(function (result) {
            // An error occurred
            if (result.getUint8(1) !== 0)
                return;
            return _this.send(137 /* RESET */);
        })
            .then(function () { return undefined; });
    };
    /**
     * Get the serial baud rate setting
     * @returns Promise of baud rate
     */
    DAPLink.prototype.getSerialBaudrate = function () {
        return this.send(129 /* READ_SETTINGS */)
            .then(function (result) {
            return result.getUint32(1, true);
        });
    };
    /**
     * Set the serial baud rate setting
     * @param baudrate The baudrate to use (defaults to 9600)
     * @returns Promise
     */
    DAPLink.prototype.setSerialBaudrate = function (baudrate) {
        if (baudrate === void 0) { baudrate = DEFAULT_BAUDRATE; }
        return this.send(130 /* WRITE_SETTINGS */, new Uint32Array([baudrate]))
            .then(function () { return undefined; });
    };
    /**
     * Start listening for serial data
     * @param serialDelay The serial delay to use (defaults to 200)
     */
    DAPLink.prototype.startSerialRead = function (serialDelay) {
        var _this = this;
        if (serialDelay === void 0) { serialDelay = DEFAULT_SERIAL_DELAY; }
        this.stopSerialRead();
        this.timer = setInterval(function () {
            return _this.send(131 /* READ */)
                .then(function (serialData) {
                if (serialData.byteLength > 0) {
                    // check if there is any data returned from the device
                    // first byte contains the vendor code
                    // second byte contains the actual length of data read from the device
                    var dataLength = serialData.getUint8(1);
                    if (dataLength !== 0) {
                        var offset = 2;
                        var dataArray = serialData.buffer.slice(offset, offset + dataLength);
                        var data = String.fromCharCode.apply(null, new Uint8Array(dataArray));
                        _this.emit(DAPLink.EVENT_SERIAL_DATA, data);
                    }
                }
            });
        }, serialDelay);
    };
    /**
     * Stop listening for serial data
     */
    DAPLink.prototype.stopSerialRead = function () {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    };
    /**
     * Write serial data
     * @param data The data to write
     * @returns Promise
     */
    DAPLink.prototype.serialWrite = function (data) {
        var arrayData = data.split("").map(function (e) { return e.charCodeAt(0); });
        arrayData.unshift(arrayData.length);
        return this.send(132 /* WRITE */, new Uint8Array(arrayData).buffer)
            .then(function () { return undefined; });
    };
    /**
     * Progress event
     * @event
     */
    DAPLink.EVENT_PROGRESS = "progress";
    /**
     * Serial read event
     * @event
     */
    DAPLink.EVENT_SERIAL_DATA = "serial";
    return DAPLink;
}(proxy_1.CmsisDAP));
exports.DAPLink = DAPLink;

//# sourceMappingURL=index.js.map
