import {_get, _set} from 'symbol-ucan';
import {AnyObj, HookContext} from '../types';
import {CoreCall} from '../core';

export const existsPath = '_exists';

export const getExists = (context:Partial<HookContext>):any => {
    const path = context.app.get('existsPath') || existsPath;
    return _get(context.params, `core.${path}.${context.path}.${context.id}`) || undefined;
}

export const loadExists = async (context:HookContext, options?:{ skipJoins?: boolean, params?: AnyObj }):Promise<any> => {
    let ex = getExists(context);
    if(!ex && context.id) {
        ex = await new CoreCall(context.path, context, { skipJoins: options?.skipJoins !== false }).get(context.id, { exists_check: true, admin_pass: true, skip_hooks: true, ...options?.params || {} })
    }
    return ex;
}

export const setExists = (context:HookContext, val:any):HookContext => {
    const path = context.app.get('existsPath') || existsPath;
    context.params = _set(context.params, `core.${path}.${context.path}.${val?._id || context.id}`, val)
    return context;
};
