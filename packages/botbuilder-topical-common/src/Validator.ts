import { Activity, Promiseable } from 'botbuilder';
import { toPromise } from './helpers';

export interface ValidatorResult <V> {
    value?: V;
    reason?: string;
}

export type Validate <V> = (activity: Partial<Activity>) => Promiseable<ValidatorResult<V> | V>;
export type StrictlyValidate <V> = (activity: Partial<Activity>) => Promise<ValidatorResult<V>>;
export type Constraint <V, W> = (activity: Partial<Activity>, value: V) => Promiseable<ValidatorResult<W> | W>;

export class Validator <V> {

    validate: StrictlyValidate<V>;

    constructor(validate: Validate<V>) {

        this.validate = async (activity) => {

            const result = await toPromise(validate(activity))

            if (result === undefined)
                return { reason: 'none' };
            
            if (typeof result === 'object' && ((result as any).reason || (result as any).value))
                return result;

            return { value: result as V };
        }
    }

    and <W = V> (
        constraint: Constraint<V, W>
    ) {

        return new Validator<W>(async activity => {

            const result = await this.validate(activity);

            if (result.reason)
                return { reason: result.reason };

            return constraint(activity, result.value!);
        });
    }
}
