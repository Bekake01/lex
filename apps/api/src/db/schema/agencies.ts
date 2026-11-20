import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// A group of users (law firm, realtor, HR, notary office). Members point here
// through users.agencyId; a user without an agency is an individual.
export const agencies = pgTable(
  'agencies',
  {
    // uuidv7() is built into Postgres 18: time-ordered, so it indexes better than random v4 ids.
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      'agencies_name_length',
      sql`char_length(trim(${t.name})) between 1 and 200`,
    ),
  ],
);

export type Agency = typeof agencies.$inferSelect;
export type NewAgency = typeof agencies.$inferInsert;
