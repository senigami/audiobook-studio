def handle_voxtral_job(jid, j, start, on_output, cancel_check, text=None):
    if cancel_check():
        on_output("Cancelled before Voxtral synthesis started.\n")
        return "cancelled"

    on_output("Voxtral generation is not implemented yet in this build.\n")
    return "not_implemented"
