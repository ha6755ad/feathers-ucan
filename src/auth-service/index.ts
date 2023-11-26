import {_get, parseUcan, ucanToken, validateUcan, encodeKeyPair, buildUcan} from 'symbol-ucan';
import {AuthenticationService, AuthenticationRequest, AuthenticationParams} from '@feathersjs/authentication';
import {AnyObj} from '../types';

export class NotAuthError extends Error {
    constructor(message?: string) {
        super(message)
    }
}
export type AuthServiceOptions = {
    NotAuthenticated?: any
}
export * from './ucan-strategy';

export class AuthService extends AuthenticationService {
    options: AuthServiceOptions
    constructor(app: any, configKey = 'authentication', opts:AnyObj&AuthServiceOptions = {}) {
        const { NotAuthenticated, ...rest } = opts
        super(app, configKey, rest)
        this.app = app;
        this.options = { NotAuthenticated }
    };

    async create(data: AuthenticationRequest, params?: AuthenticationParams) {
        const NotAuth = this.options?.NotAuthenticated || NotAuthError;

        const {entity, service, ucan_path = 'ucan'} = this.app.get('authentication');

        const authStrategies = params?.authStrategies || this.configuration.authStrategies

        if (!params) params = {}

        if (!authStrategies.length) {
            throw new NotAuth('No authentication strategies allowed for creating a JWT (`authStrategies`)')
        }

        const authResult = await this.authenticate(data, params, ...authStrategies)
            .catch((err: any) => {
                throw new Error(err.message)
            })

        if (authResult.accessToken) {
            return authResult
        }
        const did = data.did || _get(authResult, [entity, 'did']);
        let ucan = data.ucan || _get(authResult, [entity, 'ucan']);

        if (!did) throw new Error('No did audience provided');
        if (!ucan) throw new Error('No ucan provided to authentication call');
        // const {secret} = this.configuration;

        const validatedUcan = await validateUcan(ucan)
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
                console.warn('Could not validate ucan', ucan, errObj.message);
                return null;
            });
        if (!validatedUcan) {
            const parsed = parseUcan(ucan);
            let {secret} = this.app.get('authentication');

            const issuer = encodeKeyPair({secretKey: secret});
            ucan = await buildUcan({
                audience: parsed.payload.aud,
                issuer,
                // lifetimeInSeconds: 60 * 60 * 24 * 30,
                capabilities: parsed.payload.att
            })
            params.admin_pass = true;
            await this.app.service(service).patch(authResult[entity]._id, {[ucan_path]: ucanToken(ucan)}, {...params})
        }


        const accessToken = ucanToken(ucan);

        return {
            accessToken,
            ...authResult,
            authentication: {
                ...authResult.authentication,
                payload: accessToken
            }
        }
    }
}

