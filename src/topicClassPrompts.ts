import { PromptTopicClass } from './PromptTopicClass';
import { hasText, hasNumber, Culture } from './validators';

export class TextPromptTopicClass <State = any> extends PromptTopicClass<string, State> {
    constructor (name: string) {
        super(name);

        this.validator(hasText);
    }
}

export class NumberPromptTopicClass <State = any> extends PromptTopicClass<number, State> {
    constructor (name: string, culture: Culture) {
        super(name);

        this.validator(hasNumber(culture));
    }
}
