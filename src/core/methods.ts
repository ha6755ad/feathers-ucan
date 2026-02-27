type AnyObj = any

export type Id = number | string
export type NullableId = Id | null

export type CallFindResult<T = AnyObj> = {
    total:number,
    limit: number,
    skip:number,
    data: Array<T>
}
export type AnyParams = Iterable<AnyObj>

declare type CoreOpts = {
    skipJoins?: boolean,
    admin_pass?: boolean
}
export class CoreCall {
    context:any;
    service:string;
    core:AnyObj;
    entity:string;
    constructor(service:string, context:any, coreOptions?:CoreOpts){
        this.service = service
        this.context = context
        const entity = (context.app.get('authentication') || { entity: 'login' }).entity || 'login';
        this.entity = entity;
        const core = context.params?.core || {};
        if(!core[entity]) core[entity] = context.params[entity];
        this.core = { ...core, ...coreOptions }
    }

    async get(id:NullableId, params:AnyObj = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).get(id, {...params, [this.entity]: params[this.entity], ...{ [core_path]: this.core }})
    }
    async find (params:AnyObj = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).find({...params as AnyParams, [this.entity]: params[this.entity], admin_pass:true, ...{ [core_path]: this.core }})
    }
    async create (data:AnyObj, params:AnyObj = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).create(data, {...params, [this.entity]: params[this.entity], ...{ [core_path]: this.core }})
    }
    async patch (id:NullableId, data:AnyObj, params:AnyObj = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).patch(id, data, {...params, [this.entity]: params[this.entity], ...{ [core_path]: this.core }})
    }
    async update (id:NullableId, data:AnyObj, params:AnyObj = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).update(id, data, {...params, [this.entity]: params[this.entity], ...{ [core_path]: this.core }})
    }
    async remove (id:NullableId, params:AnyObj = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).remove(id, {...params, [this.entity]: params[this.entity], ...{ [core_path]: this.core }})
    }

    async _get(id:NullableId, params:AnyObj = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._get(id, {...params, [this.entity]: params[this.entity], skip_hooks: true, ...{ [core_path]: this.core }})
    }
    async _find (params:AnyObj = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._find({...params as AnyParams, [this.entity]: params[this.entity], skip_hooks: true, ...{ [core_path]: this.core }})
    }
    async _create (data:AnyObj, params:AnyObj ={}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._create(data, {...params, [this.entity]: params[this.entity], skip_hooks: true, ...{ [core_path]: this.core }})
    }
    async _patch (id:NullableId, data:AnyObj, params:AnyObj ={}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._patch(id, data, {...params, [this.entity]: params[this.entity], skip_hooks: true, ...{ [core_path]: this.core }})
    }
    async _update (id:NullableId, data:AnyObj, params:AnyObj ={}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._update(id, data, {...params, [this.entity]: params[this.entity], skip_hooks: true, ...{ [core_path]: this.core }})
    }
    async _remove (id:NullableId, params:AnyObj ={}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._remove(id, {...params, [this.entity]: params[this.entity], skip_hooks: true, ...{ [core_path]: this.core }})
    }

}

