
import { PromptTopic } from './PromptTopic';
import { hasText, hasNumber, Culture } from './validators';

export class TextPromptTopic <S = any> extends PromptTopic<string, S> {
    constructor () {
        super();

        this.validator(hasText);
    }
}

export class NumberPromptTopic <S = any> extends PromptTopic<number, S> {
    constructor (culture: Culture) {
        super();

        this.validator(hasNumber(culture));
    }
}

