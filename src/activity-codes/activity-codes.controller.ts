import { Controller, Post, Body } from '@nestjs/common';

import { ActivityCodesService } from './activity-codes.service';
import { CreateActivityCodeDto } from './dto/create-activity-code.dto';

@Controller('activity-codes')
export class ActivityCodesController {
    constructor(private readonly activityCodesService: ActivityCodesService) {}

    @Post()
    processNames(@Body() createActivityCodeDto: CreateActivityCodeDto) {
        // return this.activityCodesService.create(createActivityCodeDto);
        return 'ok';
    }
}
