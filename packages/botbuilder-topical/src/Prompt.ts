import { Promiseable, Activity } from 'botbuilder';
import { Topic, TopicInstance } from "./topical";
import { toPromise, returnsPromiseVoid, Validator, ValidatorResult } from 'botbuilder-topical-common';

export interface PromptInitArgs <S> {
    name: string;
    promptState: S;
}

export interface PromptState <S> {
    name: string;
    turns: number;
    promptState: S;
}

export interface PromptReturnArgs <V> {
    name: string;
    result: ValidatorResult<V>;
}

export type Prompter <V, S = any> = (
    context: BotContext,
    instance: TopicInstance<PromptState<S>, PromptReturnArgs<V>>,
    result?: ValidatorResult<V>
) => Promise<void>;

export class Prompt <V, S = any> extends Topic<PromptInitArgs<S>, PromptState<S>, PromptReturnArgs<V>> {
    async init (
        context: BotContext,
        instance: TopicInstance<PromptState<S>, PromptReturnArgs<V>>,
        args: PromptInitArgs<S>,
    ) {
         instance.state = {
            name: args.name,
            turns: 0,
            promptState: args.promptState,
        }
            await this._prompter(context, instance);
    }

    async onReceive (
        context: BotContext,
        instance: TopicInstance<PromptState<S>, PromptReturnArgs<V>>,
    ) {
        const result = await this._validator.validate(context.request as Activity);

        if (!result.reason)
            return this.returnToParent(instance, {
                name: instance.state.name,
                result
            });

        if (++ instance.state.turns === this._maxTurns) {
            return this.returnToParent(instance, {
                name: instance.state.name,
                result: {
                    value: result.value,
                    reason: 'too_many_attempts',
                }
            });
        }

        return this._prompter(context, instance, result);
    }

    protected _maxTurns: number = 2;

    public maxTurns(maxTurns: number) {
        this._maxTurns = maxTurns;

        return this;
    }

    protected _prompter?: Prompter<V, S> = () => {
        throw "You must provide a prompt function";
    }
    
    public prompter(prompt: Prompter<V, S>) {
        this._prompter = (context, instance, result) => toPromise(prompt(context, instance, result));

        return this;
    }

    protected _validator: Validator<V> = new Validator(() => {
        throw "You must provide a validator";
    })

    public validator(validator: Validator<V>) {
        this._validator = validator;
        return this;
    }
}
