import { PromptTopicClass } from './PromptTopicClass';
import { hasText, hasNumber, Culture } from './validators';

export class TextPromptTopicClass <State = any> extends PromptTopicClass<string, State> {
    constructor (name?: string) {
        super(name);

        this.validator(hasText);
    }
}

export class NumberPromptTopicClass <State = any> extends PromptTopicClass<number, State> {
    constructor (name: string, culture: Culture);
    constructor (culture: Culture);
    constructor (... args) {
        super(typeof args[0] === 'string' && args[0]);

        this.validator(hasNumber(args[typeof args[0] === 'string' ? 1 : 0]));
    }
}
