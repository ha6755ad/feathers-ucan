import {
    buildUcan,
    encodeKeyPair,
    parseUcan,
    ucanToken,
    validateUcan,
    stackAbilities,
    verifyUcan,
    reduceAbilities,
    _get
} from 'symbol-ucan';
import { CoreCall } from '../core'


export const updateUcan = () => {
    return async (context:any) => {

        const { add = [], remove = [] } = context.data;
        //ensure capabilities were passed
        if(!add?.length && !remove?.length) throw new Error('No new capabilities passed');

        //check ability to edit the affected capabilities
        const {secret, ucan_aud, entity, ucan} = context.app.get('authentication');
        const rootIssuer = encodeKeyPair({secretKey: secret}).did();

        const checkAbilities = stackAbilities([...add, ...remove]);

        const canEdit = await verifyUcan(_get(context.params, [entity, ucan]) as string, {
            audience: _get(context.params, ucan_aud) as string,
            requiredCapabilities: checkAbilities.map(a => {
                return {
                    //TODO: possibly READ shouldn't have the ability to allow others to READ
                    capability: a,
                    rootIssuer
                }
            })
        })

        if(!canEdit?.ok) throw new Error('You don\'t have sufficient capabilities to grant those capabilities')

        //prep edited ucan
        const subjectId = context.id;
        const service = context.data.service || 'logins';
        const path = context.data.path || 'ucan';
        const subject = await new CoreCall(service, context, { skipJoins: true }).get(subjectId);

        const decoded = parseUcan(_get(subject, path) as string);
        const {aud, att, fct, nbf, prf} = decoded.payload;

        let capabilities = [...att];
        if(remove?.length) capabilities = reduceAbilities(remove, att);
        if(add?.length) capabilities = stackAbilities([...att, ...add]);


        const raw = await buildUcan({
            issuer: encodeKeyPair({secretKey: secret}),
            audience: aud,
            lifetimeInSeconds: 60 * 60 * 24 * 60,
            proofs: prf,
            ...context.data,
            capabilities
        });

        const encoded = ucanToken(raw);
        const isValid = await validateUcan(encoded);
        if (!isValid) throw new Error('Invalid ucan generated when updating');
        const patched = await new CoreCall(service, context).patch(subjectId, { [path]: encoded });
        context.result = {raw: context.data, encoded, subject: patched};
        return context;
    }
};
