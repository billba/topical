import { Promiseable, Activity } from 'botbuilder';
import { TopicClass, TopicInstance, toPromise, returnsPromiseVoid } from "./topical";
import { Validator, ValidatorResult } from './Validator';

export interface PromptTopicClassInitArgs <S> {
    name: string;
    promptState: S;
}

export interface PromptTopicClassState <S> {
    name: string;
    turns: number;
    promptState: S;
}

export interface PromptTopicClassReturnArgs <V> {
    name: string;
    result: ValidatorResult<V>;
}

export type PromptTopicClassPrompt <V, S = any> = (
    context: BotContext,
    instance: TopicInstance<PromptTopicClassState<S>, PromptTopicClassReturnArgs<V>>,
    result?: ValidatorResult<V>
) => Promise<void>;

export class PromptTopicClass <V, S = any> extends TopicClass<PromptTopicClassInitArgs<S>, PromptTopicClassState<S>, PromptTopicClassReturnArgs<V>> {
    async init (
        context: BotContext,
        instance: TopicInstance<PromptTopicClassState<S>, PromptTopicClassReturnArgs<V>>,
        args: PromptTopicClassInitArgs<S>,
    ) {
         instance.state = {
            name: args.name,
            turns: 0,
            promptState: args.promptState,
        }
            await this._prompt(context, instance);
    }

    async onReceive (
        context: BotContext,
        instance: TopicInstance<PromptTopicClassState<S>, PromptTopicClassReturnArgs<V>>,
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

        return this._prompt(context, instance, result);
    }

    protected _maxTurns: number = 2;

    public maxTurns(maxTurns: number) {
        this._maxTurns = maxTurns;

        return this;
    }

    protected _prompt?: PromptTopicClassPrompt<V, S> = () => {
        throw "You must provide a prompt function";
    }
    
    public prompt(prompt: PromptTopicClassPrompt<V, S>) {
        this._prompt = (context, instance, result) => toPromise(prompt(context, instance, result));

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
