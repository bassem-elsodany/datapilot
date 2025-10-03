import { IToken } from 'chevrotain';
import {
  Condition,
  ConditionWithValueQuery,
  DateLiteral,
  DateNLiteral,
  Field,
  FieldFunctionExpression,
  FieldRelationship,
  FieldRelationshipWithAlias,
  FieldSubquery,
  FieldType,
  FieldTypeOf,
  FieldTypeOfCondition,
  FieldWithAlias,
  FunctionExp,
  GroupByClause,
  HavingClause,
  HavingClauseWithRightCondition,
  LiteralType,
  NullsOrder,
  OrderByClause,
  OrderByCriterion,
  OrderByFnClause,
  Query,
  Subquery,
  ValueCondition,
  ValueFunctionCondition,
  ValueQueryCondition,
  ValueWithDateNLiteralCondition,
  WhereClause,
  WhereClauseWithRightCondition,
  WhereClauseWithoutNegationOperator,
  WithDataCategoryCondition,
} from '../api/api-models';
import {
  ApexBindVariableExpressionContext,
  ApexBindVariableFunctionArrayAccessorContext,
  ApexBindVariableFunctionCallContext,
  ApexBindVariableFunctionParamsContext,
  ApexBindVariableGenericContext,
  ApexBindVariableIdentifierContext,
  ApexBindVariableNewInstantiationContext,
  ArrayExpressionWithType,
  AtomicExpressionContext,
  BooleanContext,
  ClauseStatementsContext,
  ConditionExpressionContext,
  DateNLiteralContext,
  ExpressionContext,
  ExpressionOperatorContext,
  ExpressionTree,
  FieldFunctionContext,
  FieldsFunctionContext,
  FromClauseContext,
  FunctionExpressionContext,
  GeoLocationFunctionContext,
  GroupByClauseContext,
  HavingClauseContext,
  LiteralTypeWithSubquery,
  LocationFunctionContext,
  OperatorContext,
  OperatorOrNotInContext,
  OrderByClauseContext,
  OrderByExpressionContext,
  OrderByGroupingFunctionExpressionContext,
  OrderBySpecialFunctionExpressionContext,
  SelectClauseContext,
  SelectClauseFunctionIdentifierContext,
  SelectClauseIdentifierContext,
  SelectClauseSubqueryIdentifierContext,
  SelectClauseTypeOfContext,
  SelectClauseTypeOfElseContext,
  SelectClauseTypeOfThenContext,
  SelectStatementContext,
  usingScopeClauseContext,
  ValueContext,
  WhereClauseContext,
  WhereClauseSubqueryContext,
  WithClauseContext,
  WithDateCategoryContext,
} from '../models';
import { isString, isSubqueryFromFlag, isToken, isWhereClauseWithRightCondition } from '../utils';
import { parse, ParseQueryConfig, SoqlParser } from './parser';
import { CstNode } from 'chevrotain';

const parser = new SoqlParser();

const BaseSoqlVisitor = parser.getBaseCstVisitorConstructor();

const BOOLEANS = ['TRUE', 'FALSE'];
const DATE_LITERALS: DateLiteral[] = [
  'YESTERDAY',
  'TODAY',
  'TOMORROW',
  'LAST_WEEK',
  'THIS_WEEK',
  'NEXT_WEEK',
  'LAST_MONTH',
  'THIS_MONTH',
  'NEXT_MONTH',
  'LAST_90_DAYS',
  'NEXT_90_DAYS',
  'THIS_QUARTER',
  'LAST_QUARTER',
  'NEXT_QUARTER',
  'THIS_YEAR',
  'LAST_YEAR',
  'NEXT_YEAR',
  'THIS_FISCAL_QUARTER',
  'LAST_FISCAL_QUARTER',
  'NEXT_FISCAL_QUARTER',
  'THIS_FISCAL_YEAR',
  'LAST_FISCAL_YEAR',
  'NEXT_FISCAL_YEAR',
];

const DATE_N_LITERALS: DateNLiteral[] = [
  'NEXT_N_DAYS',
  'LAST_N_DAYS',
  'N_DAYS_AGO',
  'NEXT_N_WEEKS',
  'LAST_N_WEEKS',
  'N_WEEKS_AGO',
  'NEXT_N_MONTHS',
  'LAST_N_MONTHS',
  'N_MONTHS_AGO',
  'NEXT_N_QUARTERS',
  'LAST_N_QUARTERS',
  'N_QUARTERS_AGO',
  'NEXT_N_YEARS',
  'LAST_N_YEARS',
  'N_YEARS_AGO',
  'NEXT_N_FISCAL_QUARTERS',
  'LAST_N_FISCAL_QUARTERS',
  'N_FISCAL_QUARTERS_AGO',
  'NEXT_N_FISCAL_YEARS',
  'LAST_N_FISCAL_YEARS',
  'N_FISCAL_YEARS_AGO',
];

class SOQLVisitor extends BaseSoqlVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  private helpers = {
    $_getFieldFunction: (ctx: FieldFunctionContext, isAggregateFn = false, includeType = true): FunctionExp | FieldFunctionExpression => {
      const args = ctx.functionExpression ? ctx.functionExpression.map((node: CstNode) => this.visit(node, { includeType })).flat() : [];
      const output: any = {};
      if (includeType) {
        output.type = 'FieldFunctionExpression';
      }
      output.functionName = ctx.fn[0].tokenType.name;
      output.parameters = args;
      if (includeType && isAggregateFn) {
        output.isAggregateFn = isAggregateFn;
      }
      output.rawValue = `${ctx.fn[0].image}(${args.map((arg: any) => (typeof arg === 'string' ? arg : arg.rawValue)).join(', ')})`;
      
      // Add offset information
      const fnToken = ctx.fn[0];
      const functionExpression = ctx.functionExpression?.[0];
      if (functionExpression) {
        // Find the last parameter to get the end offset
        const lastParam = args[args.length - 1];
        if (lastParam && typeof lastParam === 'object' && lastParam.endOffset) {
          output.endOffset = lastParam.endOffset;
        } else {
          // Fallback to function expression end
          const rParen = functionExpression.children?.RParen?.[0];
          output.endOffset = (rParen && 'endOffset' in rParen ? rParen.endOffset : fnToken.endOffset);
        }
      } else {
        output.endOffset = fnToken.endOffset;
      }
      output.startOffset = fnToken.startOffset;
      
      return output;
    },
    $_getLiteralTypeFromTokenType: (tokenTypeName: string | DateLiteral | DateNLiteral): LiteralType => {
      if (tokenTypeName === 'REAL_NUMBER') {
        return 'DECIMAL';
      } else if (tokenTypeName === 'CURRENCY_PREFIXED_DECIMAL') {
        return 'DECIMAL_WITH_CURRENCY_PREFIX';
      } else if (tokenTypeName === 'CURRENCY_PREFIXED_INTEGER') {
        return 'INTEGER_WITH_CURRENCY_PREFIX';
      } else if (tokenTypeName === 'SIGNED_DECIMAL') {
        return 'DECIMAL';
      } else if (tokenTypeName === 'UNSIGNED_DECIMAL') {
        return 'DECIMAL';
      } else if (tokenTypeName === 'UNSIGNED_INTEGER') {
        return 'INTEGER';
      } else if (tokenTypeName === 'SIGNED_INTEGER') {
        return 'INTEGER';
      } else if (tokenTypeName === 'DATETIME') {
        return 'DATETIME';
      } else if (tokenTypeName === 'DATE') {
        return 'DATE';
      } else if (tokenTypeName === 'NULL') {
        return 'NULL';
      } else if (tokenTypeName === 'StringIdentifier') {
        return 'STRING';
      } else if (tokenTypeName === 'Identifier') {
        return 'STRING';
      } else if (BOOLEANS.includes(tokenTypeName)) {
        return 'BOOLEAN';
      } else if (DATE_LITERALS.includes(tokenTypeName as DateLiteral)) {
        return 'DATE_LITERAL';
      } else if (DATE_N_LITERALS.includes(tokenTypeName as DateNLiteral)) {
        return 'DATE_N_LITERAL';
      } else {
        return 'STRING';
      }
    },
    /**
     * Shared logic since there are two entry points depending on if allowPartialQuery=true
     */
    $_parseSelect(ctx: SelectStatementContext, options?: { isSubquery: boolean }): Partial<Query | Subquery> {
      const { isSubquery } = options || { isSubquery: false };
      let output: Partial<Query | Subquery> = {};

      if (ctx.selectClause) {
        // @ts-ignore - this.visit is not properly detected as an available function - "this" context is not correctly detected
        output.fields = this.visit(ctx.selectClause);
      }

      if (ctx.fromClause) {
        if (isSubqueryFromFlag(output, isSubquery)) {
          // @ts-ignore - this.visit is not properly detected as an available function - "this" context is not correctly detected
          const { sObject, alias, sObjectPrefix, sObjectStartOffset, sObjectEndOffset } = this.visit(ctx.fromClause);
          output.relationshipName = sObject;
          output.relationshipNameStartOffset = sObjectStartOffset;
          output.relationshipNameEndOffset = sObjectEndOffset;
          if (alias) {
            output.sObjectAlias = alias;
          }
          if (sObjectPrefix) {
            output.sObjectPrefix = sObjectPrefix;
          }
        } else {
          // @ts-ignore - this.visit is not properly detected as an available function - "this" context is not correctly detected
          const { sObject, alias, sObjectStartOffset, sObjectEndOffset } = this.visit(ctx.fromClause);
          (output as Query).sObject = sObject;
          (output as Query).sObjectStartOffset = sObjectStartOffset;
          (output as Query).sObjectEndOffset = sObjectEndOffset;
          if (alias) {
            output.sObjectAlias = alias;
          }
        }
      }

      if (Array.isArray(output.fields)) {
        if (!!output.sObjectAlias) {
          output.fields.forEach((field: any) => {
            if (field.relationships && field.relationships[0] === output.sObjectAlias) {
              field.relationships = field.relationships.slice(1);
              field.objectPrefix = output.sObjectAlias;
            }
            if (field.relationships && field.relationships.length === 0) {
              delete field.relationships;
              field.type = 'Field';
            }
          });
        }
      }

      // @ts-ignore - this.visit is not properly detected as an available function - "this" context is not correctly detected
      output = { ...output, ...this.visit(ctx.clauseStatements) };

      return output;
    },
  };

  /**
   * Public entry point 1: `selectStatement`
   * @param ctx
   * @param options
   */
  selectStatement(ctx: SelectStatementContext, options?: { isSubquery: boolean }): Query | Subquery {
    return this.helpers.$_parseSelect.bind(this)(ctx, options) as Query | Subquery;
  }

  /**
   * Public entry point 2: `selectStatementPartial`
   * @param ctx
   * @param options
   */
  selectStatementPartial(ctx: SelectStatementContext, options?: { isSubquery: boolean }): Query | Subquery {
    return this.helpers.$_parseSelect.bind(this)(ctx, options) as Query | Subquery;
  }

  clauseStatements(ctx: ClauseStatementsContext): Partial<Query | Subquery> {
    const query: Partial<Query | Subquery> = {};
    if (ctx.usingScopeClause && !ctx.usingScopeClause[0].recoveredNode) {
      query.usingScope = this.visit(ctx.usingScopeClause);
    }

    if (ctx.whereClause && !ctx.whereClause[0].recoveredNode) {
      query.where = this.visit(ctx.whereClause);
    }

    if (ctx.withClause) {
      ctx.withClause
        .filter(item => !item.recoveredNode)
        .forEach(item => {
          const { withSecurityEnforced, withAccessLevel, withDataCategory } = this.visit(item);
          if (withSecurityEnforced) {
            query.withSecurityEnforced = withSecurityEnforced;
          }
          if (withAccessLevel) {
            query.withAccessLevel = withAccessLevel;
          }
          if (withDataCategory) {
            query.withDataCategory = withDataCategory;
          }
        });
    }

    if (ctx.groupByClause && !ctx.groupByClause[0].recoveredNode) {
      query.groupBy = this.visit(ctx.groupByClause);
    }

    if (ctx.havingClause && !ctx.havingClause[0].recoveredNode) {
      query.having = this.visit(ctx.havingClause);
    }

    if (ctx.orderByClause && !ctx.orderByClause[0].recoveredNode) {
      query.orderBy = this.visit(ctx.orderByClause);
    }

    if (ctx.limitClause && !ctx.limitClause[0].recoveredNode) {
      query.limit = Number(this.visit(ctx.limitClause));
    }

    if (ctx.offsetClause && !ctx.offsetClause[0].recoveredNode) {
      query.offset = Number(this.visit(ctx.offsetClause));
    }

    if (ctx.forViewOrReference && !ctx.forViewOrReference[0].recoveredNode) {
      query.for = this.visit(ctx.forViewOrReference);
    }

    if (ctx.updateTrackingViewstat && !ctx.updateTrackingViewstat[0].recoveredNode) {
      query.update = this.visit(ctx.updateTrackingViewstat);
    }
    return query;
  }

  selectClause(ctx: SelectClauseContext): string[] {
    if (ctx.field) {
      return ctx.field.map((item, index) => {
        if (isToken(item)) {
          const token = Array.isArray(item) ? item[0] : item;
          const field: string = token.image;
          let output: FieldType;
          if (!field.includes('.')) {
            output = {
              type: 'Field',
              field: field,
              startOffset: token.startOffset,
              endOffset: token.endOffset,
            };
          } else {
            const splitFields = field.split('.');
            output = {
              type: 'FieldRelationship',
              field: splitFields[splitFields.length - 1],
              relationships: splitFields.slice(0, splitFields.length - 1),
              rawValue: field,
              startOffset: token.startOffset,
              endOffset: token.endOffset,
            };
          }
          return output;
        } else {
          // For subqueries, find the relationship field token that precedes this subquery
          const relationshipFieldToken = this.findRelationshipFieldTokenBeforeSubquery(ctx, index);
          return this.visit(item, { relationshipFieldToken });
        }
      });
    }
    return [];
  }

  // Helper method to find the relationship field token that precedes a subquery
  private findRelationshipFieldTokenBeforeSubquery(ctx: SelectClauseContext, subqueryIndex: number): any {
    // Look backwards from the subquery index to find the relationship field token
    if (ctx.field) {
      for (let i = subqueryIndex - 1; i >= 0; i--) {
        const item = ctx.field[i];
        if (isToken(item)) {
          const token = Array.isArray(item) ? item[0] : item;
          return token;
        }
      }
    }
    return null;
  }

  selectClauseFunctionIdentifier(ctx: SelectClauseFunctionIdentifierContext): FieldRelationship | FieldRelationshipWithAlias {
    const functionResult = this.visit(ctx.fn);
    const aliasToken = ctx.alias?.[0];
    
    let output: FieldRelationship | FieldRelationshipWithAlias = {
      ...functionResult,
    };
    
    // Update end offset if alias is present
    if (aliasToken) {
      output.endOffset = aliasToken.endOffset;
    }
    
    if (ctx.alias) {
      (output as FieldRelationshipWithAlias).alias = ctx.alias[0].image;
    }
    return output;
  }

  selectClauseSubqueryIdentifier(ctx: SelectClauseSubqueryIdentifierContext, options?: { relationshipFieldToken?: any }): FieldSubquery {
    // Get the left and right parentheses tokens for offsets
    const leftParenToken = ctx.L_PAREN?.[0];
    const rightParenToken = ctx.R_PAREN?.[0];
    
    return {
      type: 'FieldSubquery',
      subquery: this.visit(ctx.selectStatement, { isSubquery: true }),
      // Use the left and right parentheses offsets for the FieldSubquery boundaries
      startOffset: leftParenToken?.startOffset || 0,
      endOffset: rightParenToken?.endOffset || 0,
    };
  }

  selectClauseTypeOf(ctx: SelectClauseTypeOfContext): FieldTypeOf {
    let conditions: FieldTypeOfCondition[] = ctx.selectClauseTypeOfThen.map((item: any) => this.visit(item));
    if (ctx.selectClauseTypeOfElse) {
      conditions.push(this.visit(ctx.selectClauseTypeOfElse));
    }
    
    // Find the Typeof and End tokens to get the full TYPEOF offset
    const typeofToken = (ctx as any).Typeof?.[0];
    const endToken = (ctx as any).End?.[0];
    
    return {
      type: 'FieldTypeof',
      field: ctx.typeOfField[0].image,
      conditions,
      startOffset: typeofToken?.startOffset || 0,
      endOffset: endToken?.endOffset || 0,
    };
  }

  selectClauseIdentifier(ctx: SelectClauseIdentifierContext): Field | FieldRelationship {
    const item = ctx.field[0];
    const alias = !!ctx.alias ? ctx.alias[0].image : undefined;
    const aliasToken = ctx.alias?.[0];
    const field: string = item.image;
    let output: FieldType;
    
    // Calculate end offset - use alias end if present, otherwise use field end
    const endOffset = aliasToken ? aliasToken.endOffset : item.endOffset;
    
    if (!field.includes('.')) {
      output = {
        type: 'Field',
        field: field,
        startOffset: item.startOffset,
        endOffset: endOffset,
      };
    } else {
      const splitFields = field.split('.');
      output = {
        type: 'FieldRelationship',
        field: splitFields[splitFields.length - 1],
        relationships: splitFields.slice(0, splitFields.length - 1),
        rawValue: field,
        startOffset: item.startOffset,
        endOffset: endOffset,
      };
    }
    if (alias) {
      (output as FieldWithAlias | FieldRelationshipWithAlias).alias = alias;
    }
    return output;
  }

  selectClauseTypeOfThen(ctx: SelectClauseTypeOfThenContext): FieldTypeOfCondition {
    return {
      type: 'WHEN',
      objectType: ctx.typeOfField[0].image,
      fieldList: ctx.field.map((item: any) => item.image),
    };
  }
  selectClauseTypeOfElse(ctx: SelectClauseTypeOfElseContext): FieldTypeOfCondition {
    return {
      type: 'ELSE',
      fieldList: ctx.field.map((item: any) => item.image),
    };
  }

  fromClause(ctx: FromClauseContext) {
    const sObjectToken = ctx.Identifier[0];
    const aliasToken = ctx.alias?.[0];
    let sObject: string = sObjectToken.image;
    let output: any;
    
    // Calculate end offset - use alias end if present, otherwise use sObject end
    const endOffset = aliasToken ? aliasToken.endOffset : sObjectToken.endOffset;
    
    if (sObject.includes('.')) {
      const sObjectPrefix = sObject.split('.');
      output = {
        sObjectPrefix: sObjectPrefix.slice(0, sObjectPrefix.length - 1),
        sObject: sObjectPrefix[sObjectPrefix.length - 1],
        sObjectStartOffset: sObjectToken.startOffset,
        sObjectEndOffset: endOffset,
      };
    } else {
      output = {
        sObject,
        sObjectStartOffset: sObjectToken.startOffset,
        sObjectEndOffset: endOffset,
      };
    }
    if (ctx.alias && ctx.alias[0]) {
      output.alias = ctx.alias[0].image;
    }
    return output;
  }

  usingScopeClause(ctx: usingScopeClauseContext) {
    return ctx.UsingScopeEnumeration[0].image;
  }

  whereClauseSubqueryIdentifier(ctx: WhereClauseSubqueryContext) {
    return this.visit(ctx.selectStatement, { isSubquery: false });
  }

  whereClause(ctx: WhereClauseContext): WhereClause {
    const where = ctx.conditionExpression.reduce(
      (expressions: ExpressionTree<WhereClause>, currExpression: any) => {
        let tempExpression: WhereClauseWithRightCondition;
        if (!expressions.expressionTree) {
          tempExpression = this.visit(currExpression);
          expressions.expressionTree = tempExpression;
        } else {
          tempExpression = this.visit(currExpression, { prevExpression: expressions.prevExpression });
          (expressions.prevExpression as WhereClauseWithRightCondition).right = tempExpression;
        }

        /**
         * Find the last expression in the chain to set as the prevExpression
         * negation expressions will sometimes return multiple chains of expressions
         */
        let currentRightExpression = tempExpression.right;
        let nextRightExpression = tempExpression.right;
        while (isWhereClauseWithRightCondition(nextRightExpression)) {
          currentRightExpression = nextRightExpression;
          nextRightExpression = nextRightExpression.right;
        }
        expressions.prevExpression = nextRightExpression || tempExpression;

        return expressions;
      },
      { prevExpression: undefined, expressionTree: undefined },
    );
    return where.expressionTree!;
  }

  conditionExpression(ctx: ConditionExpressionContext, options?: { prevExpression?: any }) {
    options = options || {};
    if (options.prevExpression && ctx.logicalOperator) {
      options.prevExpression.operator = ctx.logicalOperator[0].tokenType.name;
    }
    let baseExpression: Partial<WhereClause> = {};
    let currExpression: Partial<WhereClause> = baseExpression;

    if (Array.isArray(ctx.expressionNegation)) {
      if (ctx.expressionNegation.length === 1) {
        baseExpression = this.visit(ctx.expressionNegation);
        currExpression = (baseExpression as WhereClauseWithRightCondition).right;
      } else {
        baseExpression = this.visit(ctx.expressionNegation[0]);
        const currNestedExpression = baseExpression as WhereClauseWithRightCondition;
        ctx.expressionNegation.slice(1).forEach(item => {
          currNestedExpression.right = this.visit(item);
          currExpression = (currNestedExpression.right as WhereClauseWithRightCondition).right;
        });
      }
    }

    currExpression.left = this.visit(ctx.expression);
    return baseExpression;
  }

  withClause(ctx: WithClauseContext) {
    if (ctx.withSecurityEnforced) {
      return {
        withSecurityEnforced: true,
      };
    }
    if (ctx.withAccessLevel) {
      return {
        withAccessLevel: ctx.withAccessLevel[0].image,
      };
    }
    return {
      withDataCategory: {
        conditions: this.visit(ctx.withDataCategory),
      },
    };
  }

  withDataCategory(ctx: WithDateCategoryContext): WithDataCategoryCondition[] {
    return ctx.withDataCategoryArr.map(item => this.visit(item));
  }

  withDataCategoryArr(ctx: any): WithDataCategoryCondition {
    return {
      groupName: ctx.dataCategoryGroupName[0].image,
      selector: ctx.filteringSelector[0].image,
      parameters: ctx.dataCategoryName.map((item: any) => item.image),
    };
  }

  groupByClause(ctx: GroupByClauseContext): GroupByClause | GroupByClause[] {
    return ctx.groupBy.map(
      (groupBy): GroupByClause => (isToken(groupBy) ? { field: (Array.isArray(groupBy) ? groupBy[0] : groupBy).image } : { fn: this.visit(groupBy, { includeType: false }) }),
    );
  }

  havingClause(ctx: HavingClauseContext): HavingClause {
    // expressionWithAggregateFunction
    const having = ctx.conditionExpression.reduce(
      (expressions: ExpressionTree<HavingClause>, currExpression: any) => {
        if (!expressions.expressionTree) {
          expressions.expressionTree = this.visit(currExpression);
          expressions.prevExpression = expressions.expressionTree;
        } else {
          (expressions.prevExpression as HavingClauseWithRightCondition).right = this.visit(currExpression, {
            prevExpression: expressions.prevExpression,
          });
          expressions.prevExpression = (expressions.prevExpression as HavingClauseWithRightCondition).right;
        }
        return expressions;
      },
      { prevExpression: undefined, expressionTree: undefined },
    );
    return having.expressionTree!;
  }

  orderByClause(ctx: OrderByClauseContext): OrderByClause | OrderByClause[] {
    return ctx.orderByExpressionOrFn.map(item => this.visit(item));
  }

  orderByExpression(ctx: OrderByExpressionContext): OrderByClause {
    const orderByClause: OrderByClause = {
      field: ctx.Identifier[0].image,
    };
    if (ctx.order && ctx.order[0]) {
      orderByClause.order = ctx.order[0].tokenType.name as OrderByCriterion;
    }
    if (ctx.nulls && ctx.nulls[0]) {
      orderByClause.nulls = ctx.nulls[0].tokenType.name as NullsOrder;
    }
    return orderByClause;
  }

  orderByGroupingFunctionExpression(ctx: OrderByGroupingFunctionExpressionContext): OrderByClause {
    const orderByClause: OrderByClause = {
      fn: this.helpers.$_getFieldFunction(ctx, false, false),
    };
    if (ctx.order && ctx.order[0]) {
      orderByClause.order = ctx.order[0].tokenType.name as OrderByCriterion;
    }
    if (ctx.nulls && ctx.nulls[0]) {
      orderByClause.nulls = ctx.nulls[0].tokenType.name as NullsOrder;
    }
    return orderByClause;
  }

  orderBySpecialFunctionExpression(ctx: OrderBySpecialFunctionExpressionContext): OrderByClause {
    const orderByClause: Partial<OrderByClause> = {};
    if (ctx.aggregateFunction) {
      (orderByClause as OrderByFnClause).fn = this.visit(ctx.aggregateFunction, { includeType: false });
    } else if (ctx.dateFunction) {
      (orderByClause as OrderByFnClause).fn = this.visit(ctx.dateFunction, { includeType: false });
    } else if (ctx.locationFunction) {
      (orderByClause as OrderByFnClause).fn = this.visit(ctx.locationFunction, { includeType: false });
    }
    if (ctx.order && ctx.order[0]) {
      orderByClause.order = ctx.order[0].tokenType.name as OrderByCriterion;
    }
    if (ctx.nulls && ctx.nulls[0]) {
      orderByClause.nulls = ctx.nulls[0].tokenType.name as NullsOrder;
    }
    return orderByClause as OrderByClause;
  }

  limitClause(ctx: ValueContext) {
    return ctx.value[0].image;
  }

  offsetClause(ctx: ValueContext) {
    return ctx.value[0].image;
  }

  dateFunction(ctx: FieldFunctionContext, options: { includeType: boolean } = { includeType: true }) {
    return this.helpers.$_getFieldFunction(ctx, true, options.includeType);
  }

  aggregateFunction(ctx: FieldFunctionContext, options: { includeType: boolean } = { includeType: true }) {
    return this.helpers.$_getFieldFunction(ctx, true, options.includeType);
  }

  fieldsFunction(ctx: FieldsFunctionContext, options: { includeType: boolean } = { includeType: true }) {
    let output: any = {};
    if (options.includeType) {
      output.type = 'FieldFunctionExpression';
    }
    output = {
      ...output,
      ...{
        functionName: 'FIELDS',
        parameters: [ctx.params[0].image],
      },
    };

    output.rawValue = `FIELDS(${output.parameters[0]})`;
    
    // Add offset information
    const fnToken = ctx.fn[0];
    const paramsToken = ctx.params[0];
    output.startOffset = fnToken.startOffset;
    output.endOffset = paramsToken.endOffset;
    
    return output;
  }
  otherFunction(ctx: FieldFunctionContext, options: { includeType: boolean } = { includeType: true }) {
    return this.helpers.$_getFieldFunction(ctx, false, options.includeType);
  }

  cubeFunction(ctx: FieldFunctionContext) {
    return this.helpers.$_getFieldFunction(ctx, false, false);
  }

  rollupFunction(ctx: FieldFunctionContext) {
    return this.helpers.$_getFieldFunction(ctx, false, false);
  }

  locationFunction(ctx: LocationFunctionContext, options: { includeType: boolean } = { includeType: true }) {
    let output: any = {};
    if (options.includeType) {
      output.type = 'FieldFunctionExpression';
    }
    output = {
      ...output,
      ...{
        functionName: 'DISTANCE',
        parameters: [
          ctx.location1[0].image,
          isToken(ctx.location2) ? ctx.location2[0].image : this.visit(ctx.location2, options),
          ctx.unit[0].image,
        ],
      },
    };

    if (options.includeType) {
      output.isAggregateFn = true;
    }

    output.rawValue = `DISTANCE(${output.parameters[0]}, ${
      isString(output.parameters[1]) ? output.parameters[1] : output.parameters[1].rawValue
    }, ${output.parameters[2]})`;
    return output;
  }

  geolocationFunction(ctx: GeoLocationFunctionContext, options: { includeType: boolean } = { includeType: true }) {
    let output: any = {};
    if (options.includeType) {
      output.type = 'FieldFunctionExpression';
    }
    output = {
      ...output,
      ...{
        functionName: 'GEOLOCATION',
        parameters: [ctx.latitude[0].image, ctx.longitude[0].image],
        rawValue: `GEOLOCATION(${ctx.latitude[0].image}, ${ctx.longitude[0].image})`,
      },
    };
    return output;
  }

  functionExpression(ctx: FunctionExpressionContext, options: { includeType: boolean } = { includeType: true }): string[] {
    if (ctx.params) {
      return ctx.params.map((item: any) => {
        if (item.image) {
          return item.image;
        }
        return this.visit(item, options);
      });
    }
    return [];
  }

  expression(ctx: ExpressionContext): ConditionWithValueQuery {
    const { value, literalType, dateLiteralVariable, operator } = this.visit(ctx.operator, { returnLiteralType: true });

    const output: Partial<ConditionWithValueQuery> = {};

    if (isToken(ctx.lhs)) {
      (output as ValueCondition).field = ctx.lhs[0].image;
      // Add field offsets
      (output as ValueCondition).fieldStartOffset = ctx.lhs[0].startOffset;
      (output as ValueCondition).fieldEndOffset = ctx.lhs[0].endOffset;
    } else {
      (output as ValueFunctionCondition).fn = this.visit(ctx.lhs, { includeType: false });
    }

    (output as ValueCondition).operator = operator;
    (output as ValueCondition).literalType = literalType;

    if (literalType === 'SUBQUERY') {
      (output as ValueQueryCondition).valueQuery = value;
    } else {
      (output as ValueCondition).value = value;
    }

    if (dateLiteralVariable) {
      (output as ValueWithDateNLiteralCondition).dateLiteralVariable = dateLiteralVariable;
    }

    if (ctx.L_PAREN) {
      output.openParen = ctx.L_PAREN.length;
    }
    if (ctx.R_PAREN) {
      (output as ValueCondition).closeParen = ctx.R_PAREN.length;
    }
    
    // Add value offsets - we need to get these from the operator visit result
    if (ctx.operator && ctx.operator[0]) {
      const operatorResult = this.visit(ctx.operator[0], { returnLiteralType: true });
      if (operatorResult.valueStartOffset !== undefined && operatorResult.valueEndOffset !== undefined) {
        (output as ValueCondition).valueStartOffset = operatorResult.valueStartOffset;
        (output as ValueCondition).valueEndOffset = operatorResult.valueEndOffset;
      }
    }

    return output as Condition;
  }

  expressionPartWithNegation(ctx: any) {
    const output: Partial<WhereClauseWithoutNegationOperator> = {
      left: ctx.L_PAREN ? { openParen: ctx.L_PAREN.length } : null,
      operator: 'NOT',
      right: {
        left: {} as ValueCondition,
      },
    };
    return output;
  }

  expressionWithRelationalOperator(ctx: ExpressionOperatorContext): Condition {
    if (ctx.relationalOperator) {
      return {
        operator: this.visit(ctx.relationalOperator),
        ...this.visit(ctx.rhs, { returnLiteralType: true }),
      };
    }
    return {
      operator: this.visit(ctx.setOperator),
      ...this.visit(ctx.rhs, { returnLiteralType: true }),
    };
  }

  expressionWithSetOperator(ctx: ExpressionOperatorContext): Condition {
    if (ctx.relationalOperator) {
      return {
        operator: this.visit(ctx.relationalOperator),
        ...this.visit(ctx.rhs, { returnLiteralType: true }),
      };
    }
    return {
      operator: this.visit(ctx.setOperator),
      ...this.visit(ctx.rhs, { returnLiteralType: true }),
    };
  }

  atomicExpression(ctx: AtomicExpressionContext, options?: { returnLiteralType?: boolean }) {
    options = options || {};
    let value;
    let literalType: LiteralTypeWithSubquery;
    let dateLiteralVariable;
    if (ctx.apexBindVariableExpression) {
      value = this.visit(ctx.apexBindVariableExpression);
      literalType = 'APEX_BIND_VARIABLE';
    } else if (ctx.NumberIdentifier) {
      value = ctx.NumberIdentifier[0].image;
      literalType = this.helpers.$_getLiteralTypeFromTokenType(ctx.NumberIdentifier[0].tokenType.name);
    } else if (ctx.UnsignedInteger) {
      value = ctx.UnsignedInteger[0].image;
      literalType = 'INTEGER';
    } else if (ctx.SignedInteger) {
      value = ctx.SignedInteger[0].image;
      literalType = 'INTEGER';
    } else if (ctx.RealNumber) {
      value = ctx.RealNumber[0].image;
      literalType = 'DECIMAL';
    } else if (ctx.DateIdentifier) {
      value = ctx.DateIdentifier[0].image;
      literalType = this.helpers.$_getLiteralTypeFromTokenType(ctx.DateIdentifier[0].tokenType.name);
    } else if (ctx.CurrencyPrefixedInteger) {
      value = ctx.CurrencyPrefixedInteger[0].image;
      literalType = 'INTEGER_WITH_CURRENCY_PREFIX';
    } else if (ctx.CurrencyPrefixedDecimal) {
      value = ctx.CurrencyPrefixedDecimal[0].image;
      literalType = 'DECIMAL_WITH_CURRENCY_PREFIX';
    } else if (ctx.DateTime) {
      value = ctx.DateTime[0].image;
      literalType = 'DATETIME';
    } else if (ctx.date) {
      value = ctx.DateToken![0].image;
      literalType = 'DATE';
    } else if (ctx.NULL) {
      value = 'NULL';
      literalType = 'NULL';
    } else if (ctx.StringIdentifier) {
      value = ctx.StringIdentifier[0].image;
      literalType = 'STRING';
    } else if (ctx.Identifier) {
      value = ctx.Identifier[0].image;
      literalType = 'STRING';
    } else if (ctx.booleanValue) {
      value = this.visit(ctx.booleanValue);
      literalType = 'BOOLEAN';
    } else if (ctx.DateLiteral) {
      value = ctx.DateLiteral[0].image;
      literalType = 'DATE_LITERAL';
    } else if (ctx.dateNLiteral) {
      const valueAndVariable = this.visit(ctx.dateNLiteral);
      value = valueAndVariable.value;
      dateLiteralVariable = valueAndVariable.variable;
      literalType = 'DATE_N_LITERAL';
    } else if (ctx.arrayExpression) {
      const arrayValues: ArrayExpressionWithType[] = this.visit(ctx.arrayExpression);
      value = arrayValues.map((item: any) => item.value);
      const dateLiteralTemp = arrayValues.map((item: any) => item.variable || null);
      const hasDateLiterals = dateLiteralTemp.some(item => item !== null);
      if (new Set(arrayValues.map((item: any) => item.type)).size === 1) {
        literalType = this.helpers.$_getLiteralTypeFromTokenType(arrayValues[0].type);
      } else {
        literalType = arrayValues.map((item: any) => this.helpers.$_getLiteralTypeFromTokenType(item.type));
      }
      if (hasDateLiterals) {
        dateLiteralVariable = dateLiteralTemp;
      }
      literalType = literalType || 'STRING';
    } else if (ctx.whereClauseSubqueryIdentifier) {
      value = this.visit(ctx.whereClauseSubqueryIdentifier);
      literalType = 'SUBQUERY';
    }
    // Get offset information based on the matched token type
    let valueStartOffset = 0;
    let valueEndOffset = 0;
    
    if (ctx.apexBindVariableExpression) {
      // For apex bind variables, we'd need to traverse the expression
      valueStartOffset = 0;
      valueEndOffset = 0;
    } else if (ctx.NumberIdentifier) {
      valueStartOffset = ctx.NumberIdentifier[0].startOffset;
      valueEndOffset = ctx.NumberIdentifier[0].endOffset;
    } else if (ctx.UnsignedInteger) {
      valueStartOffset = ctx.UnsignedInteger[0].startOffset;
      valueEndOffset = ctx.UnsignedInteger[0].endOffset;
    } else if (ctx.SignedInteger) {
      valueStartOffset = ctx.SignedInteger[0].startOffset;
      valueEndOffset = ctx.SignedInteger[0].endOffset;
    } else if (ctx.RealNumber) {
      valueStartOffset = ctx.RealNumber[0].startOffset;
      valueEndOffset = ctx.RealNumber[0].endOffset;
    } else if (ctx.DateIdentifier) {
      valueStartOffset = ctx.DateIdentifier[0].startOffset;
      valueEndOffset = ctx.DateIdentifier[0].endOffset;
    } else if (ctx.CurrencyPrefixedInteger) {
      valueStartOffset = ctx.CurrencyPrefixedInteger[0].startOffset;
      valueEndOffset = ctx.CurrencyPrefixedInteger[0].endOffset;
    } else if (ctx.CurrencyPrefixedDecimal) {
      valueStartOffset = ctx.CurrencyPrefixedDecimal[0].startOffset;
      valueEndOffset = ctx.CurrencyPrefixedDecimal[0].endOffset;
    } else if (ctx.DateTime) {
      valueStartOffset = ctx.DateTime[0].startOffset;
      valueEndOffset = ctx.DateTime[0].endOffset;
    } else if (ctx.date) {
      valueStartOffset = ctx.DateToken![0].startOffset;
      valueEndOffset = ctx.DateToken![0].endOffset;
    } else if (ctx.NULL) {
      valueStartOffset = ctx.NULL[0].startOffset;
      valueEndOffset = ctx.NULL[0].endOffset;
    } else if (ctx.StringIdentifier) {
      valueStartOffset = ctx.StringIdentifier[0].startOffset;
      valueEndOffset = ctx.StringIdentifier[0].endOffset;
    } else if (ctx.Identifier) {
      valueStartOffset = ctx.Identifier[0].startOffset;
      valueEndOffset = ctx.Identifier[0].endOffset;
    } else if (ctx.booleanValue) {
      // For boolean values, we'd need to get offsets from the boolean token
      valueStartOffset = 0;
      valueEndOffset = 0;
    } else if (ctx.DateLiteral) {
      valueStartOffset = ctx.DateLiteral[0].startOffset;
      valueEndOffset = ctx.DateLiteral[0].endOffset;
    } else if (ctx.dateNLiteral) {
      // For date N literals, we'd need to get offsets from the tokens
      valueStartOffset = 0;
      valueEndOffset = 0;
    } else if (ctx.arrayExpression) {
      // For array expressions, we'd need to get offsets from the parentheses
      valueStartOffset = 0;
      valueEndOffset = 0;
    } else if (ctx.whereClauseSubqueryIdentifier) {
      // For subqueries, we'd need to get offsets from the parentheses
      valueStartOffset = 0;
      valueEndOffset = 0;
    }
    
    if (options.returnLiteralType) {
      return {
        value,
        literalType: literalType!,
        dateLiteralVariable,
        valueStartOffset,
        valueEndOffset,
      };
    } else {
      return value;
    }
  }

  apexBindVariableExpression(ctx: ApexBindVariableExpressionContext): string {
    return ctx.apex.map(item => this.visit(item)).join('.');
  }

  apexBindVariableIdentifier(ctx: ApexBindVariableIdentifierContext): string {
    let output = ctx.Identifier[0].image;
    if (ctx.apexBindVariableFunctionArrayAccessor) {
      output += this.visit(ctx.apexBindVariableFunctionArrayAccessor[0]);
    }
    return output;
  }

  apexBindVariableNewInstantiation(ctx: ApexBindVariableNewInstantiationContext): string {
    let output = `new ${ctx.function[0].image}`;
    if (ctx.apexBindVariableGeneric) {
      output += this.visit(ctx.apexBindVariableGeneric[0]);
    }
    output += this.visit(ctx.apexBindVariableFunctionParams[0]);
    if (ctx.apexBindVariableFunctionArrayAccessor) {
      output += this.visit(ctx.apexBindVariableFunctionArrayAccessor[0]);
    }
    return output;
  }

  apexBindVariableFunctionCall(ctx: ApexBindVariableFunctionCallContext): string {
    let output = `${ctx.function[0].image}${this.visit(ctx.apexBindVariableFunctionParams[0])}`;
    if (ctx.apexBindVariableFunctionArrayAccessor) {
      output += this.visit(ctx.apexBindVariableFunctionArrayAccessor[0]);
    }
    return output;
  }

  apexBindVariableGeneric(ctx: ApexBindVariableGenericContext): string {
    return `<${ctx.parameter.map(item => item.image).join(', ')}>`;
  }

  apexBindVariableFunctionParams(ctx: ApexBindVariableFunctionParamsContext): string {
    const params = Array.isArray(ctx.parameter) ? ctx.parameter : [];
    return `(${params.map(item => item.image).join(', ')})`;
  }

  apexBindVariableFunctionArrayAccessor(ctx: ApexBindVariableFunctionArrayAccessorContext): string {
    return `[${ctx.value[0].image}]`;
  }

  arrayExpression(ctx: ValueContext): ArrayExpressionWithType[] {
    return ctx.value.map((item: any) => {
      if (isToken(item)) {
        return {
          type: (item as IToken).tokenType.name,
          value: (item as IToken).image,
        };
      }
      return this.visit(item, { includeType: true });
    });
  }

  relationalOperator(ctx: OperatorContext) {
    return ctx.operator[0].image;
  }

  setOperator(ctx: OperatorOrNotInContext) {
    if (Array.isArray(ctx.operator)) {
      return ctx.operator[0].tokenType.name.replace('_', ' ');
    }
    if (Array.isArray(ctx.notIn)) {
      return this.visit(ctx.notIn);
    }
  }

  notInOperator(ctx: OperatorContext) {
    return 'NOT IN';
  }

  booleanValue(ctx: BooleanContext) {
    return ctx.boolean[0].tokenType.name;
  }

  dateNLiteral(ctx: DateNLiteralContext, options?: { includeType: true }) {
    const output: any = {
      value: `${ctx.dateNLiteral[0].image}:${ctx.variable[0].image}`,
      variable: Number(ctx.variable[0].image),
    };
    if (options && options.includeType) {
      output.type = ctx.dateNLiteral[0].tokenType.name;
    }
    return output;
  }

  forViewOrReference(ctx: ValueContext) {
    return ctx.value[0].tokenType.name;
  }

  updateTrackingViewstat(ctx: ValueContext) {
    return ctx.value[0].tokenType.name;
  }
}
// Our visitor has no state, so a single instance is sufficient.
const visitor = new SOQLVisitor();

/**
 * Parse soql query into Query data structure.
 *
 * @param soql
 * @param options
 */
export function parseQuery(soql: string, options?: ParseQueryConfig): Query {
  const { cst } = parse(soql, options);
  const query: Query = visitor.visit(cst);
  return query;
}

/**
 * Lex and parse query (without walking parsed results) to determine if query is valid.
 * options.ignoreParseErrors will not be honored
 * @param soql
 */
export function isQueryValid(soql: string, options?: ParseQueryConfig): boolean {
  try {
    const { parseErrors } = parse(soql, options);
    return parseErrors.length === 0 ? true : false;
  } catch (ex) {
    return false;
  }
}

// Cursor-to-Context Mapper Interface
export interface ContextInfo {
  nodeType: 'field' | 'sobject' | 'subquery' | 'where' | 'function' | 'unknown';
  fieldName?: string;
  sObject?: string;
  isInSubquery: boolean;
  nestingLevel: number;
  parentContext?: ContextInfo;
  startOffset?: number;
  endOffset?: number;
  cursorOffset?: number;
}

// Simple context finder that doesn't do comparison - just finds the context
function findContextAtCursorSimple(ast: Query | Subquery, cursorOffset: number, queryText?: string): ContextInfo {

  const context: ContextInfo = {
    nodeType: 'unknown',
    isInSubquery: false,
    nestingLevel: 0,
    cursorOffset: cursorOffset
  };

  // Check if cursor is in fields
  if (ast.fields) {
    for (let i = 0; i < ast.fields.length; i++) {
      const field = ast.fields[i];
      // Check if cursor is within the field OR just after it (within 5 characters for autocomplete)
      const isWithinField = cursorOffset >= field.startOffset && cursorOffset <= field.endOffset;
      const isJustAfterField = cursorOffset > field.endOffset && cursorOffset <= field.endOffset + 5;
      const contains = isWithinField || isJustAfterField;
      
      if (contains) {
        if (field.type === 'FieldSubquery') {
          if (field.subquery && field.subquery.fields) {
            const nestedContext = findContextAtCursorSimple(field.subquery, cursorOffset, queryText);
            if (nestedContext.nodeType !== 'unknown') {
              nestedContext.isInSubquery = true;
              nestedContext.nestingLevel = context.nestingLevel + 1;
              nestedContext.cursorOffset = cursorOffset;
              nestedContext.sObject = (field.subquery as any).sObject;
              return nestedContext;
            }
          }
        } else {
          context.nodeType = field.type === 'FieldRelationship' ? 'field' : 'field';
          context.fieldName = field.type === 'FieldRelationship' ? field.field : (field as any).field;
          context.startOffset = field.startOffset;
          context.endOffset = field.endOffset;
          
          if (field.type === 'FieldRelationship') {
            context.sObject = field.relationships[field.relationships.length - 1];
          }
          
          return context;
        }
      }
    }
  }

  // Check if cursor is in subqueries
  if ('subqueries' in ast && ast.subqueries && (ast.subqueries as any[]).length > 0) {
    const subqueries = ast.subqueries as any[];
    
    for (let i = 0; i < subqueries.length; i++) {
      const subquery = subqueries[i];
      
      if (subquery.startOffset && subquery.endOffset && 
          cursorOffset >= subquery.startOffset && cursorOffset <= subquery.endOffset) {
        const subqueryContext = findContextAtCursorSimple(subquery, cursorOffset, queryText);
        if (subqueryContext.nodeType !== 'unknown') {
          subqueryContext.isInSubquery = true;
          subqueryContext.nestingLevel = context.nestingLevel + 1;
          subqueryContext.cursorOffset = cursorOffset;
          subqueryContext.sObject = (subquery as any).sObject;
          return subqueryContext;
        }
      }
    }
  }

  return context;
}

// Cursor-to-Context Mapper Function
export function findContextAtCursor(ast: Query | Subquery, cursorOffset: number, queryText?: string, currentBestContext?: { context: ContextInfo | null, nestingLevel: number }): ContextInfo {
  const context: ContextInfo = {
    nodeType: 'unknown',
    isInSubquery: false,
    nestingLevel: 0,
    cursorOffset: cursorOffset
  };


  // FALLBACK: If AST is incomplete, try to infer context from query text
  if ((!ast.fields || ast.fields.length === 0) && !('sObject' in ast ? ast.sObject : false) && queryText) {
    const upperQuery = queryText.toUpperCase();
    const queryBeforeCursor = queryText.substring(0, cursorOffset).toUpperCase();
    
    // Check if we're in SELECT clause (before FROM)
    if (upperQuery.includes('SELECT') && !queryBeforeCursor.includes('FROM')) {
      context.nodeType = 'field';
      context.startOffset = Math.max(0, cursorOffset - 10);
      context.endOffset = cursorOffset + 10;
      return context;
    }
    
    // Check if we're in FROM clause
    if (queryBeforeCursor.includes('FROM') && !queryBeforeCursor.includes('WHERE')) {
      context.nodeType = 'sobject';
      context.startOffset = Math.max(0, cursorOffset - 10);
      context.endOffset = cursorOffset + 10;
      return context;
    }
    
    // Check if we're in WHERE clause
    if (queryBeforeCursor.includes('WHERE')) {
      context.nodeType = 'where';
      context.startOffset = Math.max(0, cursorOffset - 10);
      context.endOffset = cursorOffset + 10;
      return context;
    }
  }

  // Check if cursor is in fields
  if (ast.fields) {
    // First, check if cursor is after the last field but before FROM clause
    const lastField = ast.fields[ast.fields.length - 1];
    if (lastField && cursorOffset > lastField.endOffset) {
      // Check if we're before the FROM clause
      if ('sObjectStartOffset' in ast && cursorOffset < (ast as any).sObjectStartOffset) {
        context.nodeType = 'field';
        context.startOffset = lastField.endOffset;
        context.endOffset = (ast as any).sObjectStartOffset;
        return context;
      }
    }
    
    // STEP 1: Recursively collect ALL FieldSubqueries that contain the cursor at ANY nesting level
    const fieldSubqueriesWithCursor: Array<{ field: any, context: ContextInfo, nestingLevel: number }> = [];
    
    function collectAllFieldSubqueries(ast: any, currentNestingLevel: number = 0) {
      if (!ast.fields) return;
      
      for (let i = 0; i < ast.fields.length; i++) {
        const field = ast.fields[i];
        
        // Check if cursor is within this field
        if (cursorOffset >= field.startOffset && cursorOffset <= field.endOffset) {
          if (field.type === 'FieldSubquery') {
            
            // For FieldSubquery, recursively check ALL nested levels
            if (field.subquery && field.subquery.fields) {
              // Use a simple recursive call that just finds the context without comparison
              const nestedContext = findContextAtCursorSimple(field.subquery, cursorOffset, queryText);
              
              if (nestedContext.nodeType !== 'unknown') {
                // Cursor is in a nested subquery - preserve the FULL nesting depth
                nestedContext.isInSubquery = true;
                nestedContext.nestingLevel = currentNestingLevel + 1;
                nestedContext.cursorOffset = cursorOffset;
                nestedContext.sObject = (field.subquery as any).sObject;
                
                fieldSubqueriesWithCursor.push({ 
                  field, 
                  context: nestedContext, 
                  nestingLevel: currentNestingLevel + 1 
                });
              }
              
              // Recursively check deeper nesting levels
              collectAllFieldSubqueries(field.subquery, currentNestingLevel + 1);
            }
          } else {
            // For non-FieldSubquery fields, set context normally and return immediately
            context.nodeType = field.type === 'FieldRelationship' ? 'field' : 'field';
            context.fieldName = field.type === 'FieldRelationship' ? field.field : (field as any).field;
            context.startOffset = field.startOffset;
            context.endOffset = field.endOffset;
            
            if (field.type === 'FieldRelationship') {
              context.sObject = field.relationships[field.relationships.length - 1];
            }
            
            return context;
          }
        }
      }
    }
    
    // Start collecting from the top level
    collectAllFieldSubqueries(ast, 0);
    
    // STEP 2: Find the DEEPEST FieldSubquery from all collected ones
    
    let deepestFieldSubqueryContext = currentBestContext?.context || null;
    let deepestFieldNestingLevel = currentBestContext?.nestingLevel || -1;
    
    
    for (let i = 0; i < fieldSubqueriesWithCursor.length; i++) {
      const { field, context: nestedContext, nestingLevel } = fieldSubqueriesWithCursor[i];
      const currentRangeSize = field.endOffset - field.startOffset;
      const currentBestRangeSize = deepestFieldSubqueryContext ? 
        ((deepestFieldSubqueryContext as any).endOffset || 0) - ((deepestFieldSubqueryContext as any).startOffset || 0) : Infinity;
      
      
      // PRIORITY 1: Higher nesting level (deeper subquery)
      if (nestingLevel > deepestFieldNestingLevel) {
        deepestFieldSubqueryContext = nestedContext;
        deepestFieldNestingLevel = nestingLevel;
      } 
      // PRIORITY 2: Same nesting level but smaller range (more specific/nested)
      else if (nestingLevel === deepestFieldNestingLevel && currentRangeSize < currentBestRangeSize) {
        deepestFieldSubqueryContext = nestedContext;
        deepestFieldNestingLevel = nestingLevel;
      } 
      // PRIORITY 3: Same nesting level and same range size - keep the first one (no change)
      else if (nestingLevel === deepestFieldNestingLevel && currentRangeSize === currentBestRangeSize) {
      }
      // REJECT: Lower nesting level OR same level with larger range
      else {
      }
      
    }
    
    // Return the DEEPEST FieldSubquery context if found
    if (deepestFieldSubqueryContext) {
      return deepestFieldSubqueryContext;
    }
    
    // If no FieldSubquery context found, check regular fields
    for (let i = 0; i < ast.fields.length; i++) {
      const field = ast.fields[i];
      
      // Check if cursor is within this field
      if (cursorOffset >= field.startOffset && cursorOffset <= field.endOffset) {
        context.nodeType = field.type === 'FieldRelationship' ? 'field' : 'field';
        context.fieldName = field.type === 'FieldRelationship' ? field.field : (field as any).field;
        context.startOffset = field.startOffset;
        context.endOffset = field.endOffset;
        
        if (field.type === 'FieldRelationship') {
          context.sObject = field.relationships[field.relationships.length - 1];
        }
        
        return context;
      }
    }
    
    // Check if cursor is between fields (for autocomplete after a field)
    for (let i = 0; i < ast.fields.length; i++) {
      const field = ast.fields[i];
      const nextField = ast.fields[i + 1];
      if (nextField && cursorOffset > field.endOffset && cursorOffset < nextField.startOffset) {
        // Cursor is between fields, we're likely in a field list context
        context.nodeType = 'field';
        context.startOffset = field.endOffset;
        context.endOffset = nextField.startOffset;
        return context;
      }
    }
  }

  // Check if cursor is in subqueries (for multilevel subqueries)
  if ('subqueries' in ast && ast.subqueries && (ast.subqueries as any[]).length > 0) {
    const subqueries = ast.subqueries as any[];
    
    // Find the DEEPEST subquery that contains the cursor
    // When multiple ranges match, always choose the one with the highest nesting level
    let deepestSubqueryContext = currentBestContext?.context || null;
    let deepestNestingLevel = currentBestContext?.nestingLevel || -1;
    
    for (let i = 0; i < subqueries.length; i++) {
      const subquery = subqueries[i];
      
      // Check if cursor is within this subquery
      if (subquery.startOffset && subquery.endOffset && 
          cursorOffset >= subquery.startOffset && cursorOffset <= subquery.endOffset) {
        // Recursively find the DEEPEST context within this subquery (handles unlimited nesting)
        const subqueryContext = findContextAtCursor(subquery, cursorOffset, queryText, { context: deepestSubqueryContext, nestingLevel: deepestNestingLevel });
        if (subqueryContext.nodeType !== 'unknown') {
          subqueryContext.isInSubquery = true;
          subqueryContext.nestingLevel = (context.nestingLevel || 0) + 1;
          subqueryContext.cursorOffset = cursorOffset; // Preserve original cursor offset
          subqueryContext.sObject = (subquery as any).sObject; // Set the subquery's SObject
          
          // Keep track of the DEEPEST subquery (highest nesting level)
          // Priority: 1) Highest nesting level, 2) Smallest range (most specific)
          const currentRangeSize = subquery.endOffset - subquery.startOffset;
          const currentBestRangeSize = deepestSubqueryContext ? 
            ((deepestSubqueryContext as any).endOffset || 0) - ((deepestSubqueryContext as any).startOffset || 0) : Infinity;
          
          if (subqueryContext.nestingLevel > deepestNestingLevel) {
            // Higher nesting level - definitely better
            deepestSubqueryContext = subqueryContext;
            deepestNestingLevel = subqueryContext.nestingLevel;
          } else if (subqueryContext.nestingLevel === deepestNestingLevel && currentRangeSize < currentBestRangeSize) {
            // Same nesting level but smaller range (more specific) - better
            deepestSubqueryContext = subqueryContext;
            deepestNestingLevel = subqueryContext.nestingLevel;
          } else {
          }
        }
      }
    }
    
    // Return the DEEPEST subquery context if found
    if (deepestSubqueryContext) {
      return deepestSubqueryContext;
    }
  }

  // Check if cursor is in SObject name
  if ('sObjectStartOffset' in ast && 'sObjectEndOffset' in ast) {
    const sObjectStartOffset = (ast as any).sObjectStartOffset;
    const sObjectEndOffset = (ast as any).sObjectEndOffset;
    const sObject = ('sObject' in ast ? (ast as any).sObject : '') || ''; // Allow empty/incomplete SObject names
    
    // Check if cursor is within SObject range OR right after it (for autocomplete)
    if (cursorOffset >= sObjectStartOffset && cursorOffset <= sObjectEndOffset + 1) {
      context.nodeType = 'sobject';
      context.sObject = sObject;
      context.startOffset = sObjectStartOffset;
      context.endOffset = sObjectEndOffset;
      return context;
    }
  }

  // Check if cursor is in WHERE clause
  if (ast.where) {
    const whereContext = findContextInWhereClause(ast.where, cursorOffset);
    if (whereContext) {
      return { ...whereContext, isInSubquery: context.isInSubquery, nestingLevel: context.nestingLevel };
    }
  }

  return context;
}

// Helper function to find context in WHERE clause
function findContextInWhereClause(whereClause: any, cursorOffset: number): ContextInfo | null {
  // This is a simplified implementation - in a full implementation,
  // you'd traverse the entire WHERE clause tree structure
  
  if (whereClause.field && whereClause.fieldStartOffset && whereClause.fieldEndOffset) {
    if (cursorOffset >= whereClause.fieldStartOffset && cursorOffset <= whereClause.fieldEndOffset) {
      return {
        nodeType: 'field',
        fieldName: whereClause.field,
        isInSubquery: false,
        nestingLevel: 0,
        startOffset: whereClause.fieldStartOffset,
        endOffset: whereClause.fieldEndOffset
      };
    }
  }

  if (whereClause.value && whereClause.valueStartOffset && whereClause.valueEndOffset) {
    if (cursorOffset >= whereClause.valueStartOffset && cursorOffset <= whereClause.valueEndOffset) {
      return {
        nodeType: 'where',
        isInSubquery: false,
        nestingLevel: 0,
        startOffset: whereClause.valueStartOffset,
        endOffset: whereClause.valueEndOffset
      };
    }
  }

  // Recursively check nested conditions
  if (whereClause.right) {
    return findContextInWhereClause(whereClause.right, cursorOffset);
  }

  return null;
}
