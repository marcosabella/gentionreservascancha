import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NotificationPayload {
  email: string;
  subject: string;
  message: string;
  bookingDetails?: {
    court?: string;
    date?: string;
    time?: string;
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload: NotificationPayload = await req.json();
    const { email, subject, message, bookingDetails } = payload;

    if (!email || !subject || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, subject, message" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${subject}</h2>
        <p style="color: #666; line-height: 1.6;">${message}</p>
        ${bookingDetails ? `
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px;">
            <h3 style="margin-top: 0; color: #333;">Detalles de la Reserva</h3>
            ${bookingDetails.court ? `<p><strong>Cancha:</strong> ${bookingDetails.court}</p>` : ""}
            ${bookingDetails.date ? `<p><strong>Fecha:</strong> ${bookingDetails.date}</p>` : ""}
            ${bookingDetails.time ? `<p><strong>Hora:</strong> ${bookingDetails.time}</p>` : ""}
          </div>
        ` : ""}
        <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
          Este es un correo automático. Por favor no respondas a este mensaje.
        </p>
      </div>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Club de Canchas <noreply@clubdecanchas.com>",
        to: email,
        subject: subject,
        html: htmlContent,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(result)}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
        emailId: result.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to send email",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
