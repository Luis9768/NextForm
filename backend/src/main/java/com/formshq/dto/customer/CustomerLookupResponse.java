package com.formshq.dto.customer;

import com.formshq.dto.call.CallRecordResponse;

import java.util.List;
import java.util.Map;

public record CustomerLookupResponse(
        CustomerDto customer,
        String source,
        List<CallRecordResponse> recordings,
        Map<String, Object> rawData
) {
    public CustomerLookupResponse(
            CustomerDto customer,
            String source,
            List<CallRecordResponse> recordings
    ) {
        this(customer, source, recordings, Map.of());
    }
}
