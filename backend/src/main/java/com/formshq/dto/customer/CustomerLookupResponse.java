package com.formshq.dto.customer;

import com.formshq.dto.call.CallRecordResponse;

import java.util.List;

public record CustomerLookupResponse(
        CustomerDto customer,
        String source,
        List<CallRecordResponse> recordings
) {}
