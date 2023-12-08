import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActivityCode } from './entities/activity-code.entity';

@Injectable()
export class ActivityCodesService implements OnModuleInit {
    constructor(@InjectRepository(ActivityCode) private readonly activityCodesRepository: Repository<ActivityCode>) {}

    private dbActivityCodes: ActivityCode[] = [];

    async onModuleInit(): Promise<void> {
        this.dbActivityCodes = await this.activityCodesRepository.find();
        console.log(`Activity codes data loaded into memory`);
    }

    findAll(): ActivityCode[] {
        return this.dbActivityCodes;
    }

    findOne(code: string): ActivityCode {
        return this.dbActivityCodes.find(activityCode => activityCode.code === code);
    }

}
