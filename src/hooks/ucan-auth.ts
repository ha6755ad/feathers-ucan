import {HookContext} from '../types';
import {authenticate} from '@feathersjs/authentication';
import {
    Capability,
    genCapability,
    verifyUcan,
    VerifyOptions,
    encodeKeyPair
} from 'symbol-ucan';
import {CoreCall} from '../core';
import {_flatten, _get, _set} from 'symbol-ucan';

type AnyAuth = '*'
export const anyAuth: AnyAuth = '*' as AnyAuth;
type NoThrow = '$'
export const noThrow: NoThrow = '$' as NoThrow;


export type CapabilityParts = Partial<Capability> | [string, Array<string> | string];

declare type UcanAuthOptions = {
    creatorPass?: '*' | Array<string>,
    loginPass?: [Array<string>, Array<string> | '*'],
    or?: Array<string>
    adminPass?: Array<string>
}
type RequiredCapability = { capability: Capability, rootIssuer: string }
export type UcanCap = Array<CapabilityParts> | AnyAuth | NoThrow;
export type UcanAllArgs = {
    all?: UcanCap,
    get?: UcanCap,
    find?: UcanCap,
    create?: UcanCap,
    patch?: UcanCap,
    update?: UcanCap,
    remove?: UcanCap
};

type VerifyOne = { ucan: string } & VerifyOptions;

type Auth = <S>(method: string) => (context: HookContext<S>) => Promise<HookContext<S>>
type Config = { entity: string, service: string, defaultScheme: string, defaultHierPart: string };
type VerifyRes = { ok: boolean, value?: Array<any>, err?: Array<any> };

export const noThrowAuth = async <S>(context: HookContext<S>):Promise<HookContext<S>> => {
    const config = context.app.get('authentication');
    const entity = _get(context, ['auth', config.entity]);
    if (entity) context = _set(context, [config.core_path, config.entity], entity)
    context = await authenticate('jwt')(context as any)
        .catch((err: any) => {
            console.error('got error in no throw auth', err);
            return context;
        })
    return context;
}

export const bareAuth = async <S>(context: HookContext<S>):Promise<HookContext<S>> => {
    const config = context.app.get('authentication');
    const entity = _get(context, ['auth', config.entity]);
    if (entity) context = _set(context, [config.core_path, config.entity], entity)
    return authenticate('jwt')(context as any);
}

export const orVerifyLoop = async (arr: Array<VerifyOne>):Promise<VerifyRes> => {
    let v: any = {ok: false, value: []};
    const verifyOne = async (ucan: string, options: VerifyOptions) => {
        return await verifyUcan(ucan, options);
    };
    for (const i in arr) {
        if (!v?.ok) {
            const {ucan, ...options} = arr[i];
            v = await verifyOne(ucan, options)
        } else break;
    }
    return v;
}


export const verifyAgainstReqs = <S>(ucan: string, audience: string, reqs: Array<RequiredCapability>, options?: UcanAuthOptions) => {
    return async (context: HookContext<S>): Promise<VerifyRes> => {
        if (ucan && audience && options?.or?.includes(context.method)) {
            return await orVerifyLoop((reqs || []).map(a => {
                return {
                    ucan,
                    audience,
                    requiredCapabilities: [a]
                }
            }))
        } else return await verifyUcan(ucan, {audience, requiredCapabilities: reqs}) as VerifyRes
    }
}

export const ucanAuth = <S>(requiredCapabilities?: UcanCap, options?: UcanAuthOptions) => {
    return async (context: HookContext<S>): Promise<HookContext<S>> => {
        //Below for passing through auth with no required capabilities
        if (requiredCapabilities === noThrow) return await noThrowAuth(context);
        context = await bareAuth(context);
        if (requiredCapabilities === anyAuth) return context;
        if (options?.adminPass && context.params.admin_pass) return context;
        const {secret} = context.app.get('authentication') as {
            [key: string]: any
        };

        let v: any = {ok: false, value: []};

        const rootIssuer = encodeKeyPair({secretKey: secret}).did();

        const configuration = context.app.get('authentication');

        //TODO: add displayAbilities here to ensure the list is not redundant in abilities
        const reqs: Array<RequiredCapability> = (requiredCapabilities || []).map(a => {
            const config = {
                defaultScheme: configuration.defaultScheme,
                defaultHierPart: configuration.defaultHierPart
            };
            return {
                capability: Array.isArray(a) ? genCapability({
                    with: {scheme: configuration.defaultScheme, hierPart: configuration.defaultHierPart},
                    can: {namespace: a[0], segments: typeof a[1] === 'string' ? [a[1]] : a[1]}
                }, config) : genCapability(a, config),
                rootIssuer
            };
        }) as Array<RequiredCapability>

        const ucan = _get(context.params, configuration.client_ucan) as string;
        const audience = _get(context.params, configuration.ucan_aud) as string;

        if (reqs.length) {
            v = verifyAgainstReqs(ucan, audience, reqs, options)
        } else v.ok = true;
        if (v?.ok) return context
        else {
            //If creator pass enabled, check to see if the auth login is the creator of the record
            const {creatorPass, loginPass} = options || {creatorPass: false}
            if ((creatorPass && (creatorPass === '*' || (creatorPass as Array<string>).includes(context.method))) || (loginPass?.length && (loginPass[1] === '*' || loginPass[1].includes(context.method)))) {

                const existing = await new CoreCall(context.path, context, {skipJoins: true}).get(context.id);

                if (creatorPass) {
                    v.ok = (existing?.createdBy?.login) === (context.login?._id || '***');
                } else if (loginPass) {
                    const arr = _flatten(loginPass[0].map(a => _get(existing, a) as any));
                    v.ok = arr.filter((a: any) => !!a).includes(context.login?._id)
                }
            }
            if (!v?.ok) {
                let hasSplitNamespace = false;
                const reducedReqs: Array<RequiredCapability> = [];
                reqs.forEach((req, i) => {
                    const splt = (_get<RequiredCapability, string>(req, 'capability.can.namespace') || '').split(':')
                    if (splt[1]) {
                        req = _set(req, 'capability.can.namespace', splt[0]);
                        hasSplitNamespace = true;
                    }
                    reducedReqs.push(req)
                })
                if (hasSplitNamespace) v = verifyAgainstReqs(ucan, audience, reqs, options);
            }
            if (v.ok) return context;
            else {

                console.error('Ucan capabilities requirements not met: ', v, context.type, context.path);
                throw new Error('Missing proper capabilities for this action: ' + context.type + ': ' + context.path + ' - ' + context.method);
            }
        }
    }
}

export const allUcanAuth = <S>(methods: UcanAllArgs, options?: UcanAuthOptions) => {
    return async (context: HookContext<S>): Promise<HookContext<S>> => {
        const config = context.app.get('authentication');
        const entity = context.auth[config.entity];
        if (entity) context = _set(context, [config.core_path, config.entity], entity)
        if (context.type === 'before') {
            const {method} = context as { method: keyof UcanAllArgs } & HookContext<S>;
            if (methods[method as keyof UcanAllArgs] || methods['all']) {
                return ucanAuth(methods[method] || methods['all'], options)(context) as any;
            } else return context;
        } else return context;
    }
}
