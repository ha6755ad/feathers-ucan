import {AnyObj} from '../types';

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
    skipJoins?: boolean
}
export class CoreCall {
    context:any;
    service:string
    core:AnyObj
    constructor(service:string, context:any, coreOptions?:CoreOpts){
        this.service = service
        this.context = context
        this.core = { ...context.params?.core, ...coreOptions }
    }
    async get(id:NullableId, params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).get(id, {...params, ...{ [core_path]: this.core }})
    }
    async find (params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).find({...params as AnyParams, ...{ [core_path]: this.core }})
    }
    async create (data:AnyObj, params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).create(data, {...params, ...{ [core_path]: this.core }})
    }
    async patch (id:NullableId, data:AnyObj, params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).patch(id, data, {...params, ...{ [core_path]: this.core }})
    }
    async update (id:NullableId, data:AnyObj, params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).update(id, data, {...params, ...{ [core_path]: this.core }})
    }
    async remove (id:NullableId, params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service).remove(id, {...params, ...{ [core_path]: this.core }})
    }

    async _get(id:NullableId, params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._get(id, {...params, ...{ [core_path]: this.core }})
    }
    async _find (params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._find({...params as AnyParams, ...{ [core_path]: this.core }})
    }
    async _create (data:AnyObj, params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._create(data, {...params, ...{ [core_path]: this.core }})
    }
    async _patch (id:NullableId, data:AnyObj, params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._patch(id, data, {...params, ...{ [core_path]: this.core }})
    }
    async _update (id:NullableId, data:AnyObj, params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._update(id, data, {...params, ...{ [core_path]: this.core }})
    }
    async _remove (id:NullableId, params = {}){
        const {core_path} = this.context.app.get('authentication');
        return this.context.app?.service(this.service)._remove(id, {...params, ...{ [core_path]: this.core }})
    }

}

