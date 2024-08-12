# feathers-ucan

## Getting started

`npm i feathers-ucan`

`import {allUcanAuth, AuthService, ...<and so on>} from feathers-ucan`

An extension of jwt authentication in feathersjs to include the added functionality of UCAN `@ucans/ucans` tokens. More specifically, adding capabilities.

UCAN tokens are unopinionated in general, and still emerging. There is a lot more that possibly could be done with this concept, we have built only what we have managed to use in my own current scope of project needs with this library. We have tried to leav it as unopinionated as possible. 


# UCAN auth-strategy

Implementing UCAN auth in place of JWT is done, for example, like this. 

```angular2html
import {AuthService, UcanStrategy} from 'feathers-ucan';

export default (app: Application) => {
        const authentication = new AuthService(app);
        authentication.register('jwt', new UcanStrategy());
        authentication.register('local', new LocalAuth());
        authentication.register('google', new GoogleStrategy(app));
        authentication.register('linkedin', new LinkedinStrategy(app));
         const configKey = 'authentication';

         app.use('authentication', authentication);
         app.configure(expressOauth());

         app.service('authentication').hooks({
              around: {},
             after: {
                  create: [
                     ...
                 ]
            }
    });
}
```

# Implementing via hooks

See Ucan documentation for specs of ucan methods such as `verify` as well as types for standard ucan methods. This documentation is only to explain how these functions are used in hooks, and how we've extended them.

# Capabilities

For ease of use within an application setting, we have provided methods for generating proper capabilities with global application settings for `hierPart` and `scheme`. These can still be overridden easily for special requirements.

### genCapability(capabilityParts, settings)

****************capabilityParts****************: is just `Partial<Capability>` where `Capability` is just the ucan standard Capability type. genCapability generates a full capability using the settings for default `hierPart` and `scheme`.

genCapability() returns a standard ucan `Capability`

# Authentication hooks

### Config

You'll need the following config options under `default.json` `authentication` settings - accessible at `app.get('authentication')`. These could obviously be anything, but the two that are especially noteworthy are the client_ucan and ucan_aud. These are necessary for managing a ucan. 

**core:** Our chosen implementation is to pass what we label `core` params - the path to "core" is configurable in the app configuration as well. This allows us to pass along key authentication data from call to call internally so we don't lose our ucan context as we go. 

It's worth noting that the `client_ucan` is typically the calling user's `ucan` token - so it would be accessible in vanilla feathers under `context.auth.user[ucan_path]`. The `ucan_aud` is a `did` and we also save this on the user - so it too would be accessible there. We simply use the core options to avoid redundant calls to authentication on internal calls.

Also worth noting is that we expose a `CoreCall` class that allows you to make feathers service calls and automatically pass core params along in the call. We have found this to be extensible and useful over time.

```JSON
   ...
    "authentication": {
      "entity": "login",
      "service": "logins",
      "defaultScheme": "symbolDb",
      "defaultHierPart": "commoncare/*",
      "core_path": "core",
      "ucan_path": "ucan",
      "ucan_aud": "core.ucan_aud",
      "client_ucan": "core.client_ucan",
        ...
}
```

## allUcanAuth(methods, options)(context:HookContext)

### using allUcanAuth
**************methods**************: is an object that includes optional keys for all feathers service methods and the value is an array with 3 possible values:
`Array<CapabilityParts>`where `CapabilityParts` is the `Partial<Capability>` from the **********************genCapability********************** method, or a simplified `Array<[string, string]>` where the 2 elements of the array are the ucan Capability `namespace` and `segments` sequentially

In practice, here’s what methods look like (of course the mix of settings is nonsensical in normal use) that you can pass to the ********************allUcanAuth******************** function along with example capability configurations.

```jsx
import { anyAuth, noThrow } from '../ucan-auth'
const methods = {
	create: [['logins', 'WRITE']] //standard "easy" use. All capabilities are required
	patch: [['orgs', 'WRITE'], ['threads', 'READ']] //both would be required in this case unless the "or" option is passed in
	remove: [{ with: { scheme: 'yourScheme', hierPart: 'application/*' }, can: { namespace: 'collection', segments: ['WRITE'] }}]
	get: anyAuth,
	find: noThrow
}
```

************************anyAuth:************************ provides simple naked authentication and does not enforce any ucan capabilities. In other words, it’s standard JWT auth for that method. Pass/fail for a valid token.

******************noThrow:****************** is even looser - because it will not throw an error if the auth fails. It is just useful for having the `login._id` present in the `context.params`

Note: the way ucans works, you cannot simply provide a “greatest ability” and have the verify method filter out lesser abilities. In other words, if you have `WRITE` segment, you’d expect that to be valid for a `READ` requirement. However, ucans is less opinionated than that. You need to reduce the ability yourself, or it will not verify even if you have a greater ability. We have greatest ability functions, but currently the `allUcanAuth` method does not use it. Add only the greatest ability you wish to enforce. The UI we use for adding ucans to users does this already, so only custom scenarios should present a problem at this time. In the future, we will always reduce abilities for the greatest ability.

## Options

******************options:****************** is an object that allows additional settings for customizing the auth experience for common exception use cases. The following are the options

```jsx
declare type UcanAuthOptions = {
    creatorPass?: '*' | Array<string>,
    loginPass?: Array<[Array<string>, Array<string> | '*']>,
    or?: Array<string>,
    adminPass?: Array<string>
}
```

### This section needs to be reworked to be open-sourcable. This is too specific to our internal material still
- **************************creatorPass:************************** allows for a pass if the `login._id` calling the method is the same as the record in question `record.createdBy.login`
- **********************loginPass:********************** allows for a free pass list of record paths that match the `login._id` calling the method. This is an array of loginPass config options. The first element of each array are the paths such as `[owner.id]` (dot notation for nested paths). In the future we expect to add `$in` functionality that can handle nested arrays as well (the current version will pass an array that includes the correct id, but only a flat array of simple ObjectIds - true for either the path on the login or the record, both can be an array of ids). Furthermore, if you want to match the id to something other than the _id field of the login (such as a `person` or other relationship) you can do so by using `[owner.id/person]`. The `person` will match `owner.id` on the record in question to the `person` path of the login making the call. 
The second element are the methods you want to allow this on ie: `['patch', 'create']`Use the `*` superuser for allowing all methods to pass. If you want more granular field permissions - such as only allowing `patch` for the fields `color` and `name`, we support that. You would write the second argument of loginPass with a `patch/color,name` as follows (this is the full loginPass argument to avoid confusion here) [[{first argument}], ['patch/color,name', 'create']] (allowed for create as well just to illustrate how this is used);

- ********or:******** explains to run the `Capability` configuration passed to the ********allUcanAuth methods******** to be run as an or scenario instead of and. This is a significant extension of how ucans otherwise work. It will run multiple verify methods and if any pass, the auth will pass.
- **********adminPass:********** allow internal call overrides of ucan requirements. This is important for writing functions that internal operations may need to perform like removing a created org if a hook isn’t successful. Calling this requires passing an array of methods as the value of the admin option (`Array<string>`) as well as setting `context.params.admin_pass` to `true` from within the feathers app (no client side overrides). The value of this property is an array of methods to allow `admin_pass` params on.

# Example

This is a realistic example for allowing anyone to create an `org` in this application, to only allow someone with universal ucan ability to `WRITE` to `orgs` or the ability to `WRITE` on the specific org being patched. It is using the ******or****** option to ensure either of those 2 will suffice

you will notice the parts of the `Capability` are indeed partial. Whatever parts are left out are filled in the the **************************genCapability************************** defaults.

```jsx
import { CapabilityParts, anyAuth, hierPartBase, Capability, allUcanAuth, UcanAuthOptions } from '../ucans'

const writer = [['orgs', 'WRITE']] as Array<CapabilityParts>;
const deleter = [['orgs', '*']] as Array<CapabilityParts>;

const ucanArgs = (context:HookContext):UcanAuthOptions => {
    return {
        create: anyAuth,
        patch: [
            ['orgs', 'WRITE'] as [string, string],
            {
                with: {
                    hierPart: defaultHierPart
                },
                can: {
                    namespace: `orgs:${context.id}`,
                    segments: ['WRITE']
                }
            } as Partial<Capability>
        ],
        update: writer,
        remove: deleter
    }
}
```

Then the config is used in a before all hook like this

```jsx
const authenticate = async (context:HookContext):Promise<HookContext> => {
    return await allUcanAuth(ucanArgs(context), {or: ['patch'], adminPass: ['remove'] }})(context);
}

...

before: {
        all: [
            authenticate,
				]
	}
...
```

# Ucan for specific database records

The challenge of giving someone rights to write to, for example, their own profile - without granting them rights to write to all profiles is easy. However, enforcing that the other way around - where a user with permission for an entire collection should also have permissions for a specific record - poses a problem.

Ucan specs don’t allow for anything but an exact match of scheme, hierPart, namespace, and segments - except for a superuser.

So we allow for this scenario by checking for each namespace to have a `namespace:id` setup such as `orgs:423klsjsdf3kj13lkj14`.
