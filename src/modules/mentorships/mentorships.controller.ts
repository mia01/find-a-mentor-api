import {
  Body,
  BadRequestException,
  Controller,
  Param,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { ApiBearerAuth, ApiOperation, ApiUseTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  Template,
  SendDataMentorshipParams,
} from '../email/interfaces/email.interface';
import { EmailService } from '../email/email.service';
import { MentorsService } from '../common/mentors.service';
import { UsersService } from '../common/users.service';
import { User } from '../common/interfaces/user.interface';
import { MentorshipsService } from './mentorships.service';
import { MentorshipDto } from './dto/mentorship.dto';
import { Mentorship, Status } from './interfaces/mentorship.interface';

@ApiUseTags('/mentorships')
@Controller('mentorships')
export class MentorshipsController {
  constructor(
    private readonly mentorsService: MentorsService,
    private readonly usersService: UsersService,
    private readonly mentorshipsService: MentorshipsService,
    private readonly emailService: EmailService,
  ) {}

  @Post(':mentorId/apply')
  @ApiOperation({
    title: 'Creates a new mentorhip request for the given mentor',
  })
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async applyForMentorship(
    @Req() request: Request,
    @Param('mentorId') mentorId: string,
    @Body() data: MentorshipDto,
  ) {
    const current: User = await this.usersService.findByAuth0Id(
      request.user.auth0Id,
    );
    const mentor: User = await this.mentorsService.findById(mentorId);

    if (!mentor) {
      throw new BadRequestException('Mentor not found');
    }

    if (!mentor.available) {
      throw new BadRequestException('Mentor is not available');
    }

    const mentorship: Mentorship = await this.mentorshipsService.findMentorship(
      mentor._id,
      current._id,
    );
    if (mentorship) {
      throw new BadRequestException('A mentorship request already exists');
    }

    await this.mentorshipsService.createMentorship({
      mentor: mentor._id,
      mentee: current._id,
      status: Status.NEW,
      ...data,
    });

    try {
      const emailData = {
        to: mentor.email,
        templateId: Template.MENTORSHIP_REQUEST,
        name: current.name,
        message: data.message,
      };
      await this.emailService.send<SendDataMentorshipParams>(emailData);
    } catch (error) {
      Sentry.captureException(error);
    }

    return {
      success: true,
    };
  }
}
