import {AnyObj, HookContext} from '../types';
import {authenticate} from '@feathersjs/authentication';
import {_get, _set, Capability, encodeKeyPair, genCapability, VerifyOptions, verifyUcan} from 'symbol-ucan';
import {loadExists, setExists} from '../utils';

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

export declare type LoginPassOption = [Array<string>, Array<string> | '*']
export declare type UcanAuthOptions = {
    creatorPass?: '*' | Array<string>,
    loginPass?: Array<LoginPassOption>,
    or?: Array<string>
    adminPass?: Array<string>,
    noThrow?: boolean,
    log?: boolean,
    existingParams?:AnyObj
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
        .catch(() => {
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
        const core_path = configuration.core_path || 'core';
        const entity = configuration.entity || 'login';

        const {_id: loginId} = _get(context.params, [core_path, entity]) || context.params?.login || {_id: undefined}
        if (options?.log) console.log('ucan auth', 'loginId', loginId, 'core_path', core_path, 'entity', entity, 'core', context.params[core_path], 'params login', context.params.login, 'required capabilities', requiredCapabilities);
        //Below for passing through auth with no required capabilities
        if (requiredCapabilities === noThrow) return loginId ? context : await noThrowAuth(context);
        if (!loginId) context = await bareAuth(context);
        if (requiredCapabilities === anyAuth) {
            context.params.authenticated = true;
            return context;
        }
        if ((options?.adminPass || []).includes(context.method) && (_get(context.params, 'admin_pass') || _get(context.params, [configuration.core_path, 'admin_pass'])) as any) return context;

        let v: any = {ok: false, value: []};

        const reqs: Array<RequiredCapability> = modelCapabilities(requiredCapabilities as Array<CapabilityParts>, configuration as CapabilityModelConfig);

        if (reqs.length) {
            v = await verifyAgainstReqs(reqs, configuration as VerifyConfig, options)(context)
        } else v.ok = true;
        if (v?.ok) {
            context.params.authenticated = true;
            return context
        } else {
            //If creator pass enabled, check to see if the auth login is the creator of the record
            const {loginPass} = options || {loginPass: [[['*'], ['nonExistentMethod']]]}
            if (loginPass?.length) {
                //object of scrubbed data object for pass that includes only limited access or full context.data object if no limits were present
                let scrubbedData: AnyObj = {};
                //scruData defaults to true - is only set to false
                let scrubData = true;
                const checkLoginPass = async (lpass: LoginPassOption) => {
                    let methodsOnly = [];
                    const allMethods = lpass[1] === '*';
                    let methodIdx = -1;
                    if (allMethods) methodIdx = 0;
                    else {
                        //separate out any field specific methods e.g. patch/name,avatar
                        methodsOnly = (lpass[1] as string[]).map(a => a.split('/')[0]);
                        methodIdx = methodsOnly.indexOf(context.method);
                    }
                    //ensure loginPass is allowed for this method
                    if (methodIdx > -1) {

                        //retrieve existing record to check ids for login id
                        const existing = await loadExists(context, { params: options?.existingParams });
                        let loginOk = false;
                        if (existing) {
                            context = setExists(context, existing);
                            //perform the check
                            for (const passPath of lpass[0] || []) {
                                const spl = passPath.split('/');
                                const recordLoginPassId = _get(existing, spl[0]);
                                const loginIdPath = spl[1] || '_id';
                                const loginCheckId = _get(context.params, `${configuration.entity}.${loginIdPath}`) as any;
                                const checkArr = Array.isArray(loginCheckId) ? loginCheckId.map(a => String(a)) : [String(loginCheckId)];
                                if (checkArr.includes(String(recordLoginPassId))) {
                                    loginOk = true;
                                    break;
                                }
                            }
                        }

                        if (loginOk) {
                            v.ok = true
                            //loginPass is true - but check for granular field permissions such as patch/owner,color,status that imply limited permission
                            //TODO: possibly a throw option here. If loginPass is ok, it will go forward, but could send an empty or modified patch object
                            if (!(lpass[1] === '*' || ['find', 'get', 'remove'].some(a => lpass[1].includes(a)))) {
                                const currentMethod = allMethods ? '*' : lpass[1][methodIdx];
                                const splitMethod = currentMethod.split('/')[0];
                                //check if current method contains a split '/' signaling limited permission check
                                if (splitMethod !== currentMethod) {
                                    //get an array of the allowed fields
                                    const fields = currentMethod.split('/').slice(1).join('').split(',') || [];

                                    for (const field of fields) {
                                        const topLevel = _get(context.data, field);
                                        if (topLevel) scrubbedData = _set(scrubbedData, field, topLevel);
                                        else {
                                            for (const operator of ['$addToSet', '$pull']) {
                                                const operatorLevel = _get(context.data, `${operator}.${field}`);
                                                if (operatorLevel) scrubbedData = _set(scrubbedData, `${operator}.${field}`, operatorLevel);
                                            }
                                        }
                                    }
                                } else scrubData = false;
                            } else scrubData = false;
                        }
                    }
                }

                for await (const lpass of loginPass) {
                    if (scrubData) await checkLoginPass(lpass);
                    else break;
                }
                if (scrubData) context = _set(context, 'data', scrubbedData);
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
            if (v.ok) {
                context.params.authenticated = true;
                return context;
            } else {
                console.error('Ucan capabilities requirements not met: ', v, context.type, context.path);
                if (!options?.noThrow) throw new Error('Missing proper capabilities for this action: ' + context.type + ': ' + context.path + ' - ' + context.method);
                else {
                    context.params._no_throw_error = {type: context.type, method: context.method, path: context.path}
                    return context;
                }
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
