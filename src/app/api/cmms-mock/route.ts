import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Simulate generation of a unique CMMS ticket sequence
    const randNum = Math.floor(10000 + Math.random() * 90000);
    const mockTicketId = `CMMS-${randNum}`;
    
    // Simulating delay for API connection
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return NextResponse.json({
      success: true,
      ticketId: mockTicketId,
      message: `Ticket successfully created in IFM CMMS for location: ${body.location || 'Unknown'}.`
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
