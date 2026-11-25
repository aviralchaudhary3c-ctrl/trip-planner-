// Provider boundary: replace DemoBookingProvider with a contracted supplier adapter when credentials/API terms exist.
class DemoBookingProvider {
  async create({hotel,checkIn,checkOut,guests}) { return {provider:'demo',status:'confirmed',hotelId:hotel.id,checkIn,checkOut,guests}; }
}
function createBookingProvider(){ return new DemoBookingProvider(); }
module.exports={createBookingProvider,DemoBookingProvider};
