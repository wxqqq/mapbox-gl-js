// @flow

const assert = require('assert');
const { parseExpression, checkSubtype } = require('../expression');
const { typeOf } = require('../values');

import type { Expression, ParsingContext } from '../expression';
import type { Type } from '../types';

// Map input label values to output expression index
type Cases = {[number | string]: number};

class Match implements Expression {
    key: string;
    type: Type;
    inputType: Type;

    input: Expression;
    cases: Cases;
    outputs: Array<Expression>;
    otherwise: Expression;

    constructor(key: string, inputType: Type, outputType: Type, input: Expression, cases: Cases, outputs: Array<Expression>, otherwise: Expression) {
        this.key = key;
        this.inputType = inputType;
        this.type = outputType;
        this.input = input;
        this.cases = cases;
        this.outputs = outputs;
        this.otherwise = otherwise;
    }

    static parse(args: Array<mixed>, context: ParsingContext) {
        if (args.length < 5)
            return context.error(`Expected at least 4 arguments, but found only ${args.length - 1}.`);
        if (args.length % 2 !== 1)
            return context.error(`Expected an even number of arguments.`);

        let inputType;
        let outputType = context.expectedType;
        const cases = {};
        const outputs = [];
        for (let i = 2; i < args.length - 1; i += 2) {
            let labels = args[i];
            const value = args[i + 1];

            if (!Array.isArray(labels)) {
                labels = [labels];
            }

            const labelContext = context.concat(i);
            if (labels.length === 0) {
                return labelContext.error('Expected at least one branch label.');
            }

            for (const label of labels) {
                if (typeof label !== 'number' && typeof label !== 'string') {
                    return labelContext.error(`Branch labels must be numbers or strings.`);
                } else if (typeof label === 'number' && Math.abs(label) > Number.MAX_SAFE_INTEGER) {
                    return labelContext.error(`Overflow: numeric branch labels must be no larger than ${Number.MAX_SAFE_INTEGER}.`);

                } else if (typeof label === 'number' && Math.floor(label) !== label) {
                    return labelContext.error(`Numeric branch labels must be integer values.`);

                } else if (!inputType) {
                    inputType = typeOf(label);
                } else if (checkSubtype(inputType, typeOf(label), labelContext)) {
                    return null;
                }

                if (typeof cases[String(label)] !== 'undefined') {
                    return labelContext.error('Branch labels must be unique.');
                }

                cases[String(label)] = outputs.length;
            }

            const result = parseExpression(value, context.concat(i, outputType));
            if (!result) return null;
            outputType = outputType || result.type;
            outputs.push(result);
        }

        const input = parseExpression(args[1], context.concat(1, inputType));
        if (!input) return null;

        const otherwise = parseExpression(args[args.length - 1], context.concat(args.length - 1, outputType));
        if (!otherwise) return null;

        assert(inputType && outputType);
        return new Match(context.key, (inputType: any), (outputType: any), input, cases, outputs, otherwise);
    }

    compile() {
        const input = this.input.compile();
        const outputs = [`function () { return ${this.otherwise.compile()} }.bind(this)`];
        const lookup = {};

        for (const label in this.cases) {
            // shift the index stored in this.cases by one, as we're using
            // outputs[0] for the 'otherwise' case.
            lookup[`${String(label)}`] = this.cases[label] + 1;
        }
        for (const output of this.outputs) {
            outputs.push(`function () { return ${output.compile()} }.bind(this)`);
        }

        return `(function () {
            var o = [${outputs.join(', ')}];
            var l = ${JSON.stringify(lookup)};
            var i = ${input};
            return o[l[this.as(i, ${JSON.stringify(this.inputType)})] || 0]();
        }.bind(this))()`;
    }

    serialize() {
        const result = ['match'];
        result.push(this.input.serialize());
        const branches = [];
        for (const output of this.outputs) {
            branches.push([[], output.serialize()]);
        }
        for (const label in this.cases) {
            const index = this.cases[label];
            branches[index][0].push(label);
        }
        for (const [labels, expression] of branches) {
            result.push(labels);
            result.push(expression);
        }
        result.push(this.otherwise.serialize());
        return result;
    }

    accept(visitor: Visitor<Expression>) {
        visitor.visit(this);
        this.input.accept(visitor);
        for (const output of this.outputs) {
            output.accept(visitor);
        }
        this.otherwise.accept(visitor);
    }
}

module.exports = Match;
