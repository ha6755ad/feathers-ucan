import {IncomingMessage} from 'http';
import {
    AuthenticationBase,
    AuthenticationBaseStrategy,
    AuthenticationRequest,
    AuthenticationResult,
    ConnectionEvent
} from '@feathersjs/authentication';
// @ts-ignore
import lt from 'long-timeout';
import {_get, _unset, ucanToken, validateUcan} from 'symbol-ucan';

export class NotAuthError extends Error {
    constructor(message?: string) {
        super(message)
    }
}
const SPLIT_HEADER = /(\S+)\s+(\S+)/;

type AnyObj = { [key: string]: any };

export class UcanStrategy extends AuthenticationBaseStrategy {
    expirationTimers = new WeakMap();

    setAuthentication(auth: AuthenticationBase) {
        // console.log('set authentication', auth);
        auth.verifyAccessToken = (accessToken: string) => {
            return {} as any;
        };
        super.setAuthentication(auth);
    }

    get configuration() {
        const authConfig = this.authentication?.configuration || {
            service: undefined,
            entity: undefined,
            entityId: undefined
        };
        const config = super.configuration;

        return {
            service: authConfig.service,
            entity: authConfig.entity,
            entityId: authConfig.entityId,
            // propagate core_path so hooks/strategies can share the same namespace
            core_path: (this.authentication?.configuration as any)?.core_path || (authConfig as any)?.core_path,
            header: 'Authorization',
            schemes: ['Bearer', 'JWT'],
            ...config
        };
    }

    async handleConnection(event: ConnectionEvent, connection: any, authResult?: AuthenticationResult) {
        const isValidLogout = event === 'logout' && connection.authentication && authResult &&
            connection.authentication.accessToken === authResult.accessToken;

        const {accessToken, entity} = authResult || {};

        if (accessToken && event === 'login') {
            const validUcan = await validateUcan(accessToken)
                .catch(err => {
                    console.log('Could not validate ucan in connection: ', err.message);
                    const errObj = {
                        code: 0,
                        message: 'Unknown Issue Validating Ucan'
                    };
                    if (err.message.indexOf('Expired.') > -1) {
                        errObj.code = 1;
                        errObj.message = 'Expired Ucan'
                    }
                    throw new Error(errObj.message);
                });
            const {payload: {exp}} = validUcan || {payload: {exp: 0}}
            // The time (in ms) until the token expires
            const duration = (exp * 1000) - Date.now();
            // This may have to be a `logout` event but right now we don't want
            // the whole context object lingering around until the timer is gone
            const timer = lt.setTimeout(() => (this.app as any).emit('disconnect', connection), duration);

            lt.clearTimeout(this.expirationTimers.get(connection));
            this.expirationTimers.set(connection, timer);

            connection.authentication = {
                strategy: this.name,
                accessToken
            };
        } else if (event === 'disconnect' || isValidLogout) {
            const {entity} = this.configuration;

            delete connection[entity];
            delete connection.authentication;

            lt.clearTimeout(this.expirationTimers.get(connection));
            this.expirationTimers.delete(connection);
        }
    }

    verifyConfiguration() {
        const allowedKeys = ['entity', 'entityId', 'service', 'header', 'schemes', 'audience'];

        for (const key of Object.keys(this.configuration)) {
            if (!allowedKeys.includes(key)) {
                throw new Error(`Invalid ucanStrategy option 'authentication.${this.name}.${key}'. Did you mean to set it in 'authentication.jwtOptions'?`);
            }
        }

        if (typeof this.configuration.header !== 'string') {
            throw new Error(`The 'header' option for the ${this.name} strategy must be a string`);
        }
    }

    // eslint-disable-next-line no-unused-vars
    async getEntityQuery(_params: any) {
        return {};
    }

    /**
     * Return the entity for a given id
     * @param id The id to use
     * @param params Service call parameters
     */
    async getEntity(id: string, params: any) {
        const entityService = this.entityService;
        const {entity} = this.configuration;

        if (entityService === null) {
            throw new NotAuthError('Could not find entity service');
        }

        const query = await this.getEntityQuery(params);
        const getParams = Object.assign({}, _unset(params, 'provider'), {query});
        const result = await entityService.get(id, getParams);

        if (!params.provider) {
            return result;
        }

        return entityService.get(id, {...params, [entity]: result});
    }

    async getEntityId(authResult: AuthenticationResult, _params: AnyObj) {
        let {query, loginId} = _params;
        if (loginId) return loginId;
        else {
            const {service, core_path = 'core'} = this.configuration;
            const pms = {
                query: {...query, $limit: 1},
                [core_path]: {skipJoins: true, ..._params[core_path]}
            }
            // Diagnostics to help understand why a login may not be found
            if (_params?.log) {
                try {
                    console.log('[UCAN DIAG] strategy:getEntityId', {
                        service,
                        core_path,
                        query: pms.query,
                        provider: _params.provider,
                        paramsKeys: Object.keys(_params || {}).slice(0, 20)
                    });
                } catch {}
            }
            const entities = await this.app?.service(service).find({...pms, skipJoins: true, skip_hooks: true, admin_pass: true} as any);
            if (entities.total) return entities.data[0]._id;
            else throw new NotAuthError('Could not find login associated with this ucan');
        }
    }

    async authenticate(authentication: AuthenticationRequest, params: AnyObj) {
        let {accessToken, loginId, ucan} = authentication;
        const {entity, core_path} = this.configuration;
        if (!accessToken) {

            if (ucan) accessToken = ucanToken(ucan);
            else throw new NotAuthError('Missing UCAN access token');
            // } else throw new NotAuthenticated('No access token');
        }

        // Guard: prevent passing null/invalid tokens to validateUcan
        const tokenStr = String(accessToken || '').trim();
        const dotCount = (tokenStr.match(/\./g) || []).length;
        if (!tokenStr || tokenStr === 'null' || tokenStr === 'undefined' || dotCount !== 2) {
            throw new NotAuthError('Invalid or missing UCAN in Authorization header or request payload');
        }
        //
        // await verifyUcan(accessToken, {audience: ucan_audience || params.ucan_aud, requiredCapabilities})
        //      .catch(err => {
        //          console.error('error verifying ucan', err);
        //          throw new NotAuthenticated('Could not verify ucan: ' + err.message);
        //      });

        const decodedUcan = await validateUcan(accessToken)
            .catch(err => {
                console.log('Could not validate ucan during authentication: ', err.message);
                const errObj = {
                    code: 0,
                    message: 'Unknown Issue Validating Ucan'
                };
                if (err.message.indexOf('Expired.') > -1) {
                    errObj.code = 1;
                    errObj.message = 'Expired Ucan'
                }
                throw new Error(errObj.message);
            });

        if (params?.log) {
            try {
                console.log('[UCAN DIAG] strategy:authenticate', {
                    entity,
                    core_path,
                    aud: decodedUcan?.payload?.aud,
                    hasParamsEntity: !!_get(params, [core_path, entity]),
                    provider: params.provider
                });
            } catch {}
        }

        const result = {
            accessToken,
            authentication: {
                strategy: 'jwt',
                accessToken
            }
        };

        if (entity === null) {
            return result;
        }

        let value;
        const coreEntity = _get(params, [core_path, entity]);
        if (!coreEntity) {
            // Determine which field to query by (configurable) and which audience to use
            const idField = (this.configuration as any)?.entityId || 'did';
            const audience = _get(params, [core_path, 'ucan_aud']) || decodedUcan?.payload?.aud;
            if (params?.log) {
                try {
                    console.log('[UCAN DIAG] strategy:entity-lookup', {
                        idField,
                        audience,
                        usedCoreAud: !!_get(params, [core_path, 'ucan_aud'])
                    });
                } catch {}
            }
            const entityId = await this.getEntityId(result, {
                ...params,
                loginId,
                query: {[idField]: audience}
            });
            value = await this.getEntity(entityId, params);
        } else value = coreEntity;
        return {
            ...result,
            [entity]: value
        };

    }

    async parse(req: IncomingMessage) {
        const {header, schemes} = this.configuration;
        const headerValue = req.headers && req.headers[header.toLowerCase()];

        if (!headerValue || typeof headerValue !== 'string') {
            return null;
        }

        const [, scheme, schemeValue] = headerValue.match(SPLIT_HEADER) || [];
        const hasScheme = scheme && schemes.some(
            (current: any) => new RegExp(current, 'i').test(scheme)
        );

        if (scheme && !hasScheme) {
            return null;
        }

        const raw = hasScheme ? schemeValue : (headerValue as string);
        const token = typeof raw === 'string' ? raw.trim() : raw;
        // If clients accidentally send "Bearer null"/"Bearer undefined" or empty, ignore this strategy
        if (!token || token === 'null' || token === 'undefined') {
            return null;
        }
        return {
            strategy: this.name,
            accessToken: token
        };
    }
}


