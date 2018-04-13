import { Prompt, hasText, hasNumber, Culture, PromptInit, Validator } from './topical';
import { BotContext } from 'botbuilder';

export abstract class TextPrompt <
    PromptArgs = any,
    Context extends BotContext = BotContext,
> extends Prompt<string, PromptArgs, {}, Context> {

    validator = hasText;
}

export interface CultureConstructor {
    culture: string;
}

export abstract class NumberPrompt <
    PromptArgs = any,
    Context extends BotContext = BotContext,
> extends Prompt<number, PromptArgs, CultureConstructor, Context> {

    validator: Validator<number>;

    constructor(construct: CultureConstructor) {
        super(construct);
        this.validator = hasNumber(construct.culture);
    }
}
