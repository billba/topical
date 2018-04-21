import { Activity, Promiseable } from 'botbuilder';
import { toPromise } from './helpers';

export interface ValidatorResult <V> {
    value?: V;
    reason?: string;
}

export type Validate <V> = (activity: Partial<Activity>) => Promiseable<ValidatorResult<V> | V>;
export type StrictlyValidate <V> = (activity: Partial<Activity>) => Promise<ValidatorResult<V>>;
export type Constrain <V> = (activity: Partial<Activity>, value: V) => Promiseable<boolean | string | ValidatorResult<V>>;
export type Transform <V, W> = (activity: Partial<Activity>, value: V) => Promiseable<ValidatorResult<W> | W>;

export class Validator <V> {

    validate: StrictlyValidate<V>;

    constructor(
        validate: Validate<V>,
    ) {

        this.validate = async (activity) => {

            const result = await toPromise(validate(activity))

            if (result === undefined)
                return { reason: 'none' };
            
            if (typeof result === 'object' && ((result as any).reason || (result as any).value))
                return result;

            return { value: result as V };
        }
    }

    and (
        constrain: Constrain<V>,
    ) {

        return new Validator<V>(async activity => {

            const validateResult = await this.validate(activity);

            if (validateResult.reason)
                return { reason: validateResult.reason };

            const constraintResult = await constrain(activity, validateResult.value!);

            if (constraintResult === true)
                return { value : validateResult.value }
            else if (constraintResult === false || constraintResult == null)
                return { reason: 'failed_constraint' }
            else if (typeof constraintResult === 'string')
                return { reason: constraintResult }
            else
                return constraintResult;
        });
    }

    transform <W = V>(
        transform: Transform<V, W>,
    ) {

        return new Validator<W>(async activity => {

            const validateResult = await this.validate(activity);

            if (validateResult.reason)
                return { reason: validateResult.reason };

            return transform(activity, validateResult.value!);
        });
    }
}
