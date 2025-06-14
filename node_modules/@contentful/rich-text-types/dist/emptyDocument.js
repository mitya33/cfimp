"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_DOCUMENT = void 0;
var blocks_1 = require("./blocks");
/**
 * A rich text document considered to be empty.
 * Any other document structure than this is not considered empty.
 */
exports.EMPTY_DOCUMENT = {
    nodeType: blocks_1.BLOCKS.DOCUMENT,
    data: {},
    content: [
        {
            nodeType: blocks_1.BLOCKS.PARAGRAPH,
            data: {},
            content: [
                {
                    nodeType: 'text',
                    value: '',
                    marks: [],
                    data: {},
                },
            ],
        },
    ],
};
//# sourceMappingURL=emptyDocument.js.map