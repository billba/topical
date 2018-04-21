import { Prompt, hasText, hasNumber, Culture, PromptInit, Validator } from './topical';
import { TurnContext } from 'botbuilder';

export abstract class TextPrompt <
    PromptArgs = any,
    Context extends TurnContext = TurnContext,
> extends Prompt<string, PromptArgs, {}, Context> {

    validator = hasText;
}

export interface CultureConstructor {
    culture: string;
}

export abstract class NumberPrompt <
    PromptArgs = any,
    Context extends TurnContext = TurnContext,
> extends Prompt<number, PromptArgs, CultureConstructor, Context> {

    constructor(construct: CultureConstructor) {
        super(construct);
        this.validator = hasNumber(construct.culture);
    }
}
