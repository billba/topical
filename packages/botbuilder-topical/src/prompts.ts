import { Prompt, hasText, hasNumber, Culture, PromptInit } from './topical';
import { BotContext } from 'botbuilder';

export abstract class TextPrompt <
    State = any,
    Context extends BotContext = BotContext,
> extends Prompt<string, State, Context> {
    validator = hasText;
}

export abstract class NumberPrompt <
    State = any,
    Context extends BotContext = BotContext,
> extends Prompt<number, State, Context> {
    abstract culture: Culture;

    validator = hasNumber(this.culture); // <-- I have concerns about this
}
