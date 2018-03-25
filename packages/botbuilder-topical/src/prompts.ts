import { Prompt, hasText, hasNumber, Culture } from './topical';
import { BotContext } from 'botbuilder';

export class TextPromptTopic <
    State = any,
    Context extends BotContext = BotContext,
> extends Prompt<string, State, Context> {
    constructor (name?: string) {
        super(name);

        this.validator(hasText);
    }
}

export class NumberPromptTopic <
    State = any,
    Context extends BotContext = BotContext,
> extends Prompt<number, State, Context> {
    constructor (name: string, culture: Culture);
    constructor (culture: Culture);
    constructor (... args) {
        super(typeof args[0] === 'string' && args[0]);

        this.validator(hasNumber(args[typeof args[0] === 'string' ? 1 : 0]));
    }
}
