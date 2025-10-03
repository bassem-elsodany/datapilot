/*
 * Copyright (c) Austin Turner
 * The software in this package is published under the terms of the MIT license,
 * a copy of which has been included with this distribution in the LICENSE.txt file.
 */
export { parseQuery, isQueryValid, findContextAtCursor } from './parser/visitor';
export type { ContextInfo } from './parser/visitor';
export { formatQuery, composeQuery } from './composer/composer';
export * from './api/api-models';
export * from './api/public-utils';
export type { FormatOptions } from './formatter/formatter';
export type { ParseQueryConfig } from './parser/parser';

// Re-export chevrotain types that are used in public APIs
export type { CstNode, CstParser, ILexingError, IRecognitionException } from 'chevrotain';
