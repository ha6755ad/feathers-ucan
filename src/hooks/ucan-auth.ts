import {AnyObj, HookContext} from '../types';
import {authenticate} from '@feathersjs/authentication';
import {_flatten, _get, _set, Capability, encodeKeyPair, genCapability, VerifyOptions, verifyUcan} from 'symbol-ucan';
import {loadExists} from '../utils';

export type UcanAuthConfig = {
    entity: string,
    service: string,
    client_ucan: string,
    ucan_aud: string,
    ucan_path: string,
    core_path: string,
    defaultHierPart: string,
    defaultScheme: string
}

type AuthConfig = {
    [key: string]: string
}

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

export const noThrowAuth = async <S>(context: HookContext<S>): Promise<HookContext<S>> => {
    const config = context.app.get('authentication') as AuthConfig;
    const entity = _get(context, ['auth', config.entity]);
    if (entity) context = _set(context, [config.core_path, config.entity], entity)
    context = await authenticate('jwt')(context as any)
        .catch((err: any) => {
            console.error('got error in no throw auth', err);
            return context;
        })
    return context;
}

export const bareAuth = async <S>(context: HookContext<S>): Promise<HookContext<S>> => {
    const config = context.app.get('authentication') as AuthConfig;
    const entity = _get(context, ['auth', config.entity]);
    if (entity) context = _set(context, [config.core_path, config.entity], entity)
    return authenticate('jwt')(context as any);
}

export const orVerifyLoop = async (arr: Array<VerifyOne>): Promise<VerifyRes> => {
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

export type VerifyConfig = {
    client_ucan: string,
    ucan_aud: string,
    [key: string]: any
};
export const verifyAgainstReqs = <S>(reqs: Array<RequiredCapability>, config: VerifyConfig, options?: UcanAuthOptions) => {
    return async (context: HookContext<S>): Promise<VerifyRes> => {
        const ucan = _get(context.params, config.client_ucan) as string;
        const audience = _get(context.params, config.ucan_aud) as string;
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

export type CapabilityModelConfig = {
    defaultScheme: string,
    defaultHierPart: string,
    secret: string,
    [key: string]: any
};

export const modelCapabilities = (reqs: Array<CapabilityParts>, config: CapabilityModelConfig): Array<RequiredCapability> => {

    const rootIssuer = encodeKeyPair({secretKey: config.secret}).did();

    return (reqs || []).map(a => {
        return {
            capability: Array.isArray(a) ? genCapability({
                with: {scheme: config.defaultScheme, hierPart: config.defaultHierPart},
                can: {namespace: a[0], segments: typeof a[1] === 'string' ? [a[1]] : a[1]}
            }, config) : genCapability(a, config),
            rootIssuer
        };
    }) as Array<RequiredCapability>
};

export const ucanAuth = <S>(requiredCapabilities?: UcanCap, options?: UcanAuthOptions) => {
    return async (context: HookContext<S>): Promise<HookContext<S>> => {
        const configuration = context.app.get('authentication') as AnyObj;

        const loginId = context.params?.login?._id;
        //Below for passing through auth with no required capabilities
        if (requiredCapabilities === noThrow) return loginId ? context : await noThrowAuth(context);
        if(!loginId) context = await bareAuth(context);
        if (requiredCapabilities === anyAuth) return context;
        if ((options?.adminPass || []).includes(context.method) && (_get(context.params, 'admin_pass') || _get(context.params, [configuration.core_path, 'admin_pass'])) as any) return context;

        let v: any = {ok: false, value: []};

        const reqs: Array<RequiredCapability> = modelCapabilities(requiredCapabilities as Array<CapabilityParts>, configuration as CapabilityModelConfig);

        if (reqs.length) {
            v = await verifyAgainstReqs(reqs, configuration as VerifyConfig, options)(context)
        } else v.ok = true;
        if (v?.ok) return context
        else {
            //If creator pass enabled, check to see if the auth login is the creator of the record
            const {creatorPass, loginPass} = options || {creatorPass: false}
            if ((creatorPass && (creatorPass === '*' || (creatorPass as Array<string>).includes(context.method))) || (loginPass?.length && (loginPass[1] === '*' || loginPass[1].includes(context.method)))) {

                const existing = await loadExists(context);

                if (creatorPass) {
                    v.ok = (_get(existing, ['createdBy', configuration.entity])) === (_get(context, [configuration.entity, '_id']) || '***');
                } else if (loginPass) {
                    const arr = _flatten((loginPass[0] || []).map(a => _get(existing, a) as any).map(a => Array.isArray(a) ? a : [a])) as Array<any>;
                    const id = _get(context.params, [configuration.entity, '_id']) as any;
                    const arr2 = arr.filter((a:any) => !!a);
                    v.ok = arr2.map(a => String(a)).includes(String(id))
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
                if (hasSplitNamespace) v = await verifyAgainstReqs(reqs, configuration as VerifyConfig, options)(context);
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
        const config = context.app.get('authentication') as AuthConfig;
        const entity = _get(context, ['auth', config.entity]);
        if (entity) context = _set(context, [config.core_path, config.entity], entity)
        if (context.type === 'before') {
            const {method} = context as { method: keyof UcanAllArgs } & HookContext<S>;
            if (methods[method as keyof UcanAllArgs] || methods['all']) {
                return await ucanAuth(methods[method] || methods['all'], options)(context) as any;
            } else return context;
        } else return context;
    }
}
