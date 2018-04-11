import { Prompt, hasText, hasNumber, Culture, PromptInit, Validator } from './topical';
import { BotContext } from 'botbuilder';

export abstract class TextPrompt <
    State = any,
    Context extends BotContext = BotContext,
> extends Prompt<string, State, {}, Context> {

    validator = hasText;
}

export interface CultureConstruct {
    culture: Culture;
}

export abstract class NumberPrompt <
    State = any,
    Context extends BotContext = BotContext,
> extends Prompt<number, State, CultureConstruct, Context> {

    validator: Validator<number>;

    constructor(construct: CultureConstruct) {
        super(construct);
        this.validator = hasNumber(construct.culture);
    }
}

export class T extends TextPrompt {

    async prompter() {

    }
}