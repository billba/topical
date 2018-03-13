import { Promiseable, Activity } from 'botbuilder';
import { Topic, toPromise, returnsPromiseVoid, Validator, ValidatorResult } from './topical';

export interface PromptInitArgs <S> {
    promptState: S;
}

export interface PromptState <S> {
    turns: number;
    promptState: S;
}

export class Prompt <V, S = any> extends Topic<PromptInitArgs<S>, PromptState<S>, ValidatorResult<V>> {
    protected _maxTurns: number = 2;

    public maxTurns(maxTurns: number) {
        this._maxTurns = maxTurns;

        return this;
    }

    protected _prompt?: (context: BotContext, turn: number, result?: ValidatorResult<V>) => Promise<void>;
    
    public prompt(prompt: (context: BotContext, turn: number, result?: ValidatorResult<V>) => Promiseable<void>) {
        this._prompt = (context, turn, result) => toPromise(prompt(context, turn, result));

        return this;
    }

    protected _validator: Validator<V>;

    public validator(validator: Validator<V>) {
        this._validator = validator;
        return this;
    }

    async init (
        context: BotContext,
        args?: PromptInitArgs<S>
    ) {
        this.state = {
            turns: 0,
            promptState: args && args.promptState
        }
        await this._prompt(context, 0);
    }

    async onReceive (
        context: BotContext
    ) {
        const result = await this._validator.validate(context.request as Activity);

        if (!result.reason)
            return await this.returnToParent(context, result);

        if (++ this.state.turns === this._maxTurns) {
            return this.returnToParent(context, {
                value: result.value,
                reason: 'too_many_attempts',
            });
        }

        return this._prompt(context, this.state.turns, result);
    }
}
