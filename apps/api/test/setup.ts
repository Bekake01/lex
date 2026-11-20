import { Logger } from '@nestjs/common';

// Nest's logger would print a line per job in every test run.
Logger.overrideLogger(false);
