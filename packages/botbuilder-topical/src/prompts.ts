import { Prompt, hasText, hasNumber, Culture } from './topical';

export class TextPromptTopic <State = any> extends Prompt<string, State> {
    constructor (name?: string) {
        super(name);

        this.validator(hasText);
    }
}

export class NumberPromptTopic <State = any> extends Prompt<number, State> {
    constructor (name: string, culture: Culture);
    constructor (culture: Culture);
    constructor (... args) {
        super(typeof args[0] === 'string' && args[0]);

        this.validator(hasNumber(args[typeof args[0] === 'string' ? 1 : 0]));
    }
}
