export const existsPath = '_exists';
import {HookContext} from '../types';
import {CoreCall} from '../core';

export const getExists = (context:Partial<HookContext>):any => {
    const path = context.app.get('existsPath') || existsPath;
    return context.params ? context.params[`${path}:${context.path}`] : undefined;
}

export const loadExists = async (context:HookContext):Promise<any> => {
    let ex = getExists(context);
    if(!ex && context.id) {
        ex = await new CoreCall(context.path, context, { skipJoins: true }).get(context.id, { admin_pass: true })
    }
    return ex;
}

export const setExists = (context:HookContext, val:any):HookContext => {
    const path = context.app.get('existsPath') || existsPath;
    context.params[`${path}:${context.path}`] = val;
    return context;
};
