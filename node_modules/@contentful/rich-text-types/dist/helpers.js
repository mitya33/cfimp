"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInline = isInline;
exports.isBlock = isBlock;
exports.isText = isText;
var blocks_1 = require("./blocks");
var inlines_1 = require("./inlines");
/**
 * Tiny replacement for Object.values(object).includes(key) to
 * avoid including CoreJS polyfills
 */
function hasValue(obj, value) {
    for (var _i = 0, _a = Object.keys(obj); _i < _a.length; _i++) {
        var key = _a[_i];
        if (value === obj[key]) {
            return true;
        }
    }
    return false;
}
/**
 * Checks if the node is an instance of Inline.
 */
function isInline(node) {
    return hasValue(inlines_1.INLINES, node.nodeType);
}
/**
 * Checks if the node is an instance of Block.
 */
function isBlock(node) {
    return hasValue(blocks_1.BLOCKS, node.nodeType);
}
/**
 * Checks if the node is an instance of Text.
 */
function isText(node) {
    return node.nodeType === 'text';
}
//# sourceMappingURL=helpers.js.map