
import { Prompt, hasText, hasNumber, Culture } from './topical';

export class TextPrompt <S = any> extends Prompt<string, S> {
    constructor () {
        super();

        this.validator(hasText);
    }
}

export class NumberPrompt <S = any> extends Prompt<number, S> {
    constructor (culture: Culture) {
        super();

        this.validator(hasNumber(culture));
    }
}

