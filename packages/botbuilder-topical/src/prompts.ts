import { Prompt, hasText, hasNumber, Culture, PromptInit, Validator } from './topical';
import { BotContext } from 'botbuilder';

export abstract class TextPrompt <
    PromptArgs = any,
    Context extends BotContext = BotContext,
> extends Prompt<string, PromptArgs, {}, Context> {

    validator = hasText;
}

export interface CultureConstruct {
    culture: Culture;
}

export abstract class NumberPrompt <
    PromptArgs = any,
    Context extends BotContext = BotContext,
> extends Prompt<number, PromptArgs, CultureConstruct, Context> {

    validator: Validator<number>;

    constructor(construct: CultureConstruct) {
        super(construct);
        this.validator = hasNumber(construct.culture);
    }
}
