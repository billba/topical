import { Activity, Promiseable } from 'botbuilder';
import { toPromise } from './helpers';

export interface ValidatorResult <V> {
    value?: V;
    reason?: string;
}

export type Validate <V> = (activity: Activity) => Promiseable<ValidatorResult<V> | V>;
export type StrictValidate <V> = (activity: Activity) => Promise<ValidatorResult<V>>;
export type Constraint <V, W = V> = (activity: Activity, value: V) => Promiseable<ValidatorResult<W> | W>;

export class Validator <V> {
    validate: StrictValidate<V>;

    constructor(validate: Validate<V>) {
        this.validate = async (activity) => {
            const result = await toPromise(validate(activity))

            if (!result)
                return {
                    reason: 'none'
                }

            if (typeof result === 'object') {
                if ((result as any).reason || (result as any).value)
                    return result as ValidatorResult<V>;
            }

            return {
                value: result
            } as ValidatorResult<V>
        }
    }

    and <W = V> (
        constraint: Constraint<V, W>
    ): Validator <W> {
        return new Validator(async activity => {
            const result = await this.validate(activity);
            if (result.reason)
                return {
                    reason: result.reason
                };
            return constraint(activity, result.value);
        })
    }
}

const isMessage = new Validator<Partial<Activity>>(activity => activity.type === 'message'
    ? {
        value: activity
    } : {
        reason: 'not_a_message'
    }
);

const hasText = isMessage
    .and<string>((activity, value) => {
        const text = value.text.trim();

        return text.length
            ? {
                value: text
            }
            : {
                reason: 'empty_text'
            }
    });
