import { Block, Inline, Node, Text } from './types';
/**
 * Checks if the node is an instance of Inline.
 */
export declare function isInline(node: Node): node is Inline;
/**
 * Checks if the node is an instance of Block.
 */
export declare function isBlock(node: Node): node is Block;
/**
 * Checks if the node is an instance of Text.
 */
export declare function isText(node: Node): node is Text;
