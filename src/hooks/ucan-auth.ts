import {HookContext} from '../types';
import {authenticate} from '@feathersjs/authentication';
import {
    _get,
    _set,
    Capability,
    encodeKeyPair,
    genCapability,
    parseUcan,
    ucanToken,
    VerifyOptions,
    verifyUcan
} from 'symbol-ucan';
import {loadExists, setExists} from '../utils';
import {CoreCall} from '../core';

type AnyObj = any

const SUPERUSER = '*'

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
    or?: '*' | Array<string>
    adminPass?: Array<string>,
    noThrow?: boolean,
    log?: boolean,
    existingParams?: AnyObj,
    specialChange?: Array<string> | AnyAuth,
    cap_subjects?: Array<string>,
    audience?: string
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
    if (entity) {
        context = _set(context, [config.core_path, config.entity], entity)
    }
    try {
        context = await authenticate('jwt')(context as any)
            .catch(() => {
                return context;
            })
    } catch (e) {
        return context;
    }
    return context;
}

export const bareAuth = async <S>(context: HookContext<S>): Promise<HookContext<S>> => {
    const config = context.app.get('authentication') as AuthConfig;
    const entity = _get(context, ['auth', config.entity]);
    if (entity) context = _set(context, [config.core_path, config.entity], entity)
    return authenticate('jwt')(context as any);
}

const verifyOne = async (ucan: string, options: VerifyOptions, log?: boolean) => {
    try {
        let v = await verifyUcan(ucan, options);
        if (!v?.ok && options.requiredCapabilities) {
            const newCapabilities = options.requiredCapabilities.map(a => {
                if (a.capability.can !== SUPERUSER) a.capability.can.segments = ['*']
                return a
            })
            if (log) console.log('set new req capabilities', newCapabilities, parseUcan(ucan))
            v = await verifyUcan(ucan, {
                ...options, requiredCapabilities: newCapabilities
            })
            if (log) console.log('Second verification result:', v);
        }
        return v;
    } catch (e: any) {
        return {ok: false, err: [e.message]}
    }
};
export const orVerifyLoop = async (arr: Array<VerifyOne>, log?: boolean): Promise<VerifyRes> => {
    let v: any = {ok: false, value: []};

    try {
        for (const i in arr) {
            if (log) console.log('or verify loop', arr[i], parseUcan(arr[i].ucan));
            if (!v?.ok) {
                const {ucan, ...options} = arr[i];
                v = await verifyOne(ucan, options, log)
                if (log) console.log('got in verify loop', v);
            } else break;
        }
        return v;
    } catch (e: any) {
        return {ok: false, err: [e.message]}
    }
}

export type VerifyConfig = {
    client_ucan: string,
    ucan_aud: string,
    [key: string]: any
};

type MethodOpts = { aud?: string }
export const verifyAgainstReqs = <S>(reqs: Array<RequiredCapability>, config: VerifyConfig, options?: UcanAuthOptions) => {
    return async (context: HookContext<S>): Promise<VerifyRes> => {
        const log = options?.log
        const ucan = _get(context.params, config.client_ucan) as string;
        const audience = options?.audience || _get(context.params, config.ucan_aud) as string;
        if (log) console.log('verify against reqs', reqs)
        let vMethod: (uc?: string, methodOpts?: MethodOpts) => Promise<VerifyRes>
        const or = options?.or || []
        if (ucan && (or === '*' || or.includes(context.method))) vMethod = (uc?: string, methodOpts?: MethodOpts) => orVerifyLoop((reqs || []).map(a => {
            return {
                ucan: uc || ucan,
                audience: methodOpts?.aud || audience,
                requiredCapabilities: [a]
            }
        }), log)
        else vMethod = (uc?: string, methodOpts?: MethodOpts) => verifyOne(uc || ucan, {
            audience: methodOpts?.aud || audience,
            requiredCapabilities: reqs
        }, log) as Promise<VerifyRes>
        let v = await vMethod()
        if (log) console.log('first verify try', v);
        if (v?.ok) return v;
        const cs = (options?.cap_subjects || []).filter(a => !!a)
        if (log) console.log('check cap_subjects', cs);
        if (cs) {
            const configuration = config?.loginConfig || context.app.get('authentication') as AnyObj;
            const loginCheckId = String(_get(context.params, `${configuration.entity}._id` || '')) as any;
            const caps = await new CoreCall(configuration.capability_service || 'caps', context).find({
                query: {
                    $limit: cs.length,
                    subject: {$in: cs}
                },
                skip_hooks: true,
                admin_pass: true
            })
                .catch(err => console.log(`Error finding caps in ucan auth: ${err.message}`))
            if (log) console.log('caps', caps);
            if (caps?.data) {
                for (const cap of caps.data) {
                    for (const k in cap.caps || {}) {
                        if (log) console.log('check cap', k, cap.caps[k].logins, loginCheckId);
                        if ((cap.caps[k].logins || []).map((a: any) => String(a)).includes(loginCheckId)) {
                            try {
                                const ucanString = ucanToken(cap.caps[k].ucan)
                                if (log) console.log('got ucan string', ucanString);
                                if (ucanString) {
                                    v = await vMethod(ucanString, {aud: cap.did})
                                    if (log) console.log('tried v on cap', v);
                                }
                            } catch (e: any) {
                                console.log(`Error verifying ucan from cap: ${cap._id}. Err:${e.message}`)
                            }
                            if (options?.log) console.log('tried v on cap', v);
                            if (v?.ok) return v;
                        }
                    }
                }
            }
        }
        return v;
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
    if (!Array.isArray(reqs)) return []
    return reqs.map(a => {
        return {
            capability: Array.isArray(a) ? genCapability({
                with: {scheme: config.defaultScheme, hierPart: config.defaultHierPart},
                can: {namespace: a[0], segments: typeof a[1] === 'string' ? [a[1]] : a[1]}
            }, config) : genCapability(a, config),
            rootIssuer
        };
    }) as Array<RequiredCapability>
};

export declare type PassConfig = {
    loginConfig?: VerifyConfig
}
export const checkUcan = (requiredCapabilities: UcanCap, options?: UcanAuthOptions & PassConfig) => {
    return async (context: HookContext): Promise<HookContext> => {
        const configuration = options?.loginConfig || context.app.get('authentication') as AnyObj;

        let v: any = {ok: false, value: []};

        const reqs: Array<RequiredCapability> = modelCapabilities(requiredCapabilities as Array<CapabilityParts>, configuration as CapabilityModelConfig);

        if (reqs.length) {
            v = await verifyAgainstReqs(reqs, configuration as VerifyConfig, options)(context)

            /** if the anyAuth setting is used along with specialChange, a user could get through to this point despite not being authenticated, so this step does not allow a pass for anyAuth setting even though no requiredCapabilities are present - because it was intended to throw if not authenticated unless special change conditions are met */
        } else if (requiredCapabilities !== '*') v.ok = true;
        if (v?.ok) {
            context.params.authenticated = true;
            context.params.canU = true;
            return context
        } else {

            // if (!v?.ok) {
            //     let hasSplitNamespace = false;
            //     const reducedReqs: Array<RequiredCapability> = [];
            //     reqs.forEach((req, i) => {
            //         const splt = (_get<RequiredCapability, string>(req, 'capability.can.namespace') || '').split(':')
            //         if (splt[1]) {
            //             req = _set(req, 'capability.can.namespace', splt[0]);
            //             hasSplitNamespace = true;
            //         }
            //         reducedReqs.push(req)
            //     })
            //     if (hasSplitNamespace) v = await verifyAgainstReqs(reqs, configuration as VerifyConfig, options)(context);
            // }


            if (options?.log) console.log('checking special change', options?.specialChange);
            if (options?.specialChange) {
                if (options.specialChange === anyAuth) {
                    context.params.canU = true;
                    return context;
                } else if (Array.isArray(options.specialChange)) {
                    if (['create', 'patch', 'update'].includes(context.method)) {
                        if (Array.isArray(context.data)) throw new Error('No multi data allowed with special change')
                        for (const k in context.data || {}) {
                            if (['$set', '$unset', '$addToSet', '$pull', '$push'].includes(k)) {
                                for (const sk in context.data[k] || {}) {
                                    if (!options.specialChange.includes(sk)) {
                                        const spl = sk.split('.');
                                        if (spl.length === 1) delete context.data[k][sk];
                                        else if (!options.specialChange.includes(spl[0])) delete context.data[k][sk]
                                    }
                                }
                            } else if (!options.specialChange.includes(k)) delete context.data[k];
                        }
                        context.params.canU = true;
                        return context;
                    }
                }
            }
            if (v?.ok) {
                context.params.authenticated = true;
                context.params.canU = true;
                return context;
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
                        /**ensure loginPass is allowed for this method*/
                        if (methodIdx > -1) {
                            /**retrieve existing record to check ids for login id*/
                            const existing = await loadExists(context, {params: options?.existingParams});
                            let loginOk = false;

                            /** function for comparing record login id with context login*/
                            const checkLogin = (recordLoginPassId: string, loginIdPath: string = '_id') => {
                                const loginCheckId = _get(context.params, `${configuration.entity}.${loginIdPath}`) as any;
                                /**Make sure both are present to avoid pass on undefined*/
                                if (loginCheckId && recordLoginPassId) {
                                    /** change login path result to array no matter what */
                                    const checkArr = Array.isArray(loginCheckId) ? loginCheckId.map(a => String(a)) : [String(loginCheckId)];
                                    if (Array.isArray(recordLoginPassId)) {
                                        /**loop through to see if there is a match present use for loops for performance instead of some*/
                                        for (let i = 0; i < checkArr.length; i++) {
                                            const checkId = String(checkArr[i])
                                            for (let rl = 0; rl < recordLoginPassId.length;) {
                                                const rlId = String(recordLoginPassId[rl]);
                                                if (rlId === checkId) loginOk = true;
                                                else rl++;
                                            }
                                            if (loginOk) return;
                                        }
                                    } else if (checkArr.includes(String(recordLoginPassId))) {
                                        return loginOk = true;
                                    }
                                } else return
                            }

                            if (existing) {
                                context = setExists(context, existing);
                                /**perform the check*/
                                let recordLoginPassId;
                                for (const passPath of lpass[0] || []) {
                                    const spl = String(passPath).split('/');
                                    if (spl[0].includes('*')) {
                                        const spl2 = spl[0].split('*');
                                        const obj = _get(existing, spl2[0]);
                                        if (obj && typeof obj === 'object') {
                                            if (Array.isArray(obj)) {
                                                /** IF array, iterate through array and check the sub-path */
                                                for (const o of obj) {
                                                    checkLogin(_get(o, spl2[1]) as string, spl[1] || '_id');
                                                    if (loginOk) break;
                                                }
                                            } else {
                                                /** IF object, iterate through object and check the sub-path */
                                                for (const k in obj) {
                                                    checkLogin(_get(obj, `${k}.${spl2[1]}`) as string, spl[1] || '_id')
                                                    if (loginOk) break;
                                                }
                                            }
                                        }

                                    } else checkLogin(_get(existing, spl[0]) as string, spl[1] || '_id');

                                }
                            }

                            if (loginOk) {
                                v.ok = true
                                /**loginPass is true - but check for granular field permissions such as patch/owner,color,status that imply limited permission*/
                                //TODO: possibly a throw option here. If loginPass is ok, it will go forward, but could send an empty or modified patch object
                                if (lpass[1] !== '*' && !['find', 'get', 'remove'].some(a => lpass[1].includes(a))) {
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

                if (v?.ok) {
                    context.params.authenticated = true;
                    context.params.canU = true;
                    return context;
                } else {

                    if (options?.log) console.error('Ucan capabilities requirements not met: ', v, context.type, context.path);
                    if (!options?.noThrow) throw new Error('Missing proper capabilities for this action: ' + context.type + ': ' + context.path + ' - ' + context.method);
                    else {
                        context.params._no_throw_error = {
                            type: context.type,
                            method: context.method,
                            path: context.path
                        }
                        return context;
                    }
                }
            }
        }
    }
}

export const ucanAuth = <S>(requiredCapabilities?: UcanCap, options?: UcanAuthOptions) => {
    return async (context: HookContext<S>): Promise<HookContext<S>> => {
        const configuration = context.app.get('authentication') as AnyObj;
        const core_path = configuration.core_path || 'core';
        const entity = configuration.entity || 'login';

        const existingLogin:any = _get(context.params, [core_path, entity]) || _get(context.params, 'login') || _get(context.params.connection, entity);
        if(existingLogin) context.params[entity] = existingLogin;
        const loginId = typeof existingLogin === 'string' ? existingLogin : existingLogin?._id;
        const hasLogin = !!(existingLogin && (typeof existingLogin === 'string' || !!loginId));
        const existingUcan = _get(context.params, configuration.client_ucan || 'client_ucan');
        if (options?.log) console.log('ucan auth', 'hasLogin', hasLogin, 'loginId', loginId, 'existingUcan', !!existingUcan, 'core_path', core_path, 'entity', entity, 'core', context.params[core_path], 'params login', context.params.login, 'required capabilities', requiredCapabilities);
        //Below for passing through auth with no required capabilities
        if (requiredCapabilities === noThrow || (requiredCapabilities && requiredCapabilities[context.method] === noThrow)) return hasLogin ? context : await noThrowAuth(context);
        const adminPass = (options?.adminPass || []).includes(context.method) && (_get(context.params, 'admin_pass') || _get(context.params, [configuration.core_path, 'admin_pass'])) as any
        // If no login is present and no client UCAN is provided, perform authentication. Otherwise, reuse existing state/ucan.
        if (!hasLogin && !existingUcan) context = (adminPass || options?.specialChange) ? await noThrowAuth(context) : await bareAuth(context);
        if (requiredCapabilities === anyAuth && !options?.specialChange) {
            context.params.authenticated = !!context.params[entity];
            return context;
        }
        if (adminPass) return context;
        if (!requiredCapabilities) return context;
        return await checkUcan(requiredCapabilities, options)(context)
    }
}

export const allUcanAuth = <S>(methods: UcanAllArgs, options?: UcanAuthOptions) => {
    return async (context: HookContext<S>): Promise<HookContext<S>> => {
        const config = context.app.get('authentication') as AuthConfig;
        // if a login is already present in params[core_path][entity], don't overwrite it
        const corePath = (config as any).core_path || 'core';
        const entityKey = (config as any).entity || 'login';
        const existingLogin = _get(context.params, [corePath, entityKey]);
        if (!existingLogin) {
            const entity = _get(context, ['auth', entityKey]);
            if (entity) context = _set(context, [corePath, entityKey], entity)
        }
        if (context.type === 'before') {
            const {method} = context as { method: keyof UcanAllArgs } & HookContext<S>;
            if (methods[method as keyof UcanAllArgs] || methods['all']) {
                return await ucanAuth(methods[method] || methods['all'], options)(context) as any;
            } else return context;
        } else return context;
    }
}
