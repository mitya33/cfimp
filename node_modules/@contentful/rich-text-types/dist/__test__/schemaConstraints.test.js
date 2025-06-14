"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var blocks_1 = require("../blocks");
var schemaConstraints_1 = require("../schemaConstraints");
var allKnownBlocks = Object.values(blocks_1.BLOCKS);
describe('schema constraints', function () {
    it('all block node types are either considered a container or void', function () {
        var blocks = __spreadArray(__spreadArray(__spreadArray([
            blocks_1.BLOCKS.DOCUMENT
        ], schemaConstraints_1.VOID_BLOCKS, true), schemaConstraints_1.TEXT_CONTAINERS, true), Object.keys(schemaConstraints_1.CONTAINERS), true);
        expect(blocks).toEqual(expect.arrayContaining(allKnownBlocks));
        expect(blocks.length).toEqual(allKnownBlocks.length);
    });
    it('should allow UL_LIST and OL_LIST blocks as children of TABLE_CELL', function () {
        // Get the children of TABLE_CELL
        var tableCellChildren = schemaConstraints_1.CONTAINERS[blocks_1.BLOCKS.TABLE_CELL];
        // Check that UL_LIST and OL_LIST are in the children array
        expect(tableCellChildren).toContain(blocks_1.BLOCKS.UL_LIST);
        expect(tableCellChildren).toContain(blocks_1.BLOCKS.OL_LIST);
    });
});
//# sourceMappingURL=schemaConstraints.test.js.map