import type { ApplicationFoundation } from '../../composition-root.js'
import { BookingAvailabilityEngine } from './booking.engine.js'
import { AddBookingItem, BookingOperations, CancelBooking, CheckInBooking, CompleteBooking, ConfirmBooking,
  CreateBooking, GetBooking, GetBookingAvailability, GetBookingList, GetBranchCalendar, GetEmployeeAvailability,
  MarkNoShow, RemoveBookingItem, RescheduleBooking, SearchBooking, StartBooking, UpdateBooking, UpdateBookingItem,
} from './booking.use-cases.js'

export function createBookingModule(foundation: ApplicationFoundation) {
  const operations = new BookingOperations({ repository: foundation.repositories.bookings,
    transactions: foundation.transactionManager, policyEngine: foundation.policies.engine,
    policy: foundation.policies.booking, eventFactory: foundation.eventFactory, events: foundation.eventPublisher,
    clock: foundation.clock, ids: foundation.ids, availability: new BookingAvailabilityEngine() })
  return { availability: new GetBookingAvailability(operations), employeeAvailability: new GetEmployeeAvailability(operations),
    calendar: new GetBranchCalendar(operations), create: new CreateBooking(operations), update: new UpdateBooking(operations),
    get: new GetBooking(operations), list: new GetBookingList(operations), search: new SearchBooking(operations),
    cancel: new CancelBooking(operations), reschedule: new RescheduleBooking(operations),
    confirm: new ConfirmBooking(operations), checkIn: new CheckInBooking(operations), start: new StartBooking(operations),
    complete: new CompleteBooking(operations), noShow: new MarkNoShow(operations), addItem: new AddBookingItem(operations),
    updateItem: new UpdateBookingItem(operations), removeItem: new RemoveBookingItem(operations) }
}

export type BookingModule = ReturnType<typeof createBookingModule>
