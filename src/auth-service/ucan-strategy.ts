import {IncomingMessage} from 'http';
import {
    AuthenticationBaseStrategy,
    ConnectionEvent,
    AuthenticationResult,
    AuthenticationBase, AuthenticationRequest
} from '@feathersjs/authentication';
import lt from 'long-timeout';
import {validateUcan, ucanToken, _unset, _get} from 'symbol-ucan';

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
        super.authentication = auth;
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
                    console.log('Could not validate ucan: ', err.message);
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
            const entities = await this.app?.service(service).find(pms as any);
            if (entities.total) return entities.data[0]._id;
            else throw new NotAuthError('Could not find login associated with this ucan');
        }
    }

    async authenticate(authentication: AuthenticationRequest, params: AnyObj) {
        let {accessToken, loginId, ucan} = authentication;
        const {entity, core_path} = this.configuration;
        if (!accessToken) {

            if (ucan) accessToken = ucanToken(ucan);
            else throw new NotAuthError('Error generating ucan');
            // } else throw new NotAuthenticated('No access token');
        }
        //
        // await verifyUcan(accessToken, {audience: ucan_audience || params.ucan_aud, requiredCapabilities})
        //      .catch(err => {
        //          console.error('error verifying ucan', err);
        //          throw new NotAuthenticated('Could not verify ucan: ' + err.message);
        //      });

        const decodedUcan = await validateUcan(accessToken)
            .catch(err => {
                console.log('Could not validate ucan: ', err.message);
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
            const entityId = await this.getEntityId(result, {
                ...params,
                loginId,
                query: {did: decodedUcan?.payload.aud}
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

        return {
            strategy: this.name,
            accessToken: hasScheme ? schemeValue : headerValue
        };
    }
}


