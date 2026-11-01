package com.linhafarma.domain.reserva;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class QuantidadeReservaTest {

    private static final String MESSAGE = "Reservation quantity must be greater than zero";

    @Test
    void rejectsNegativeQuantity() {
        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> new QuantidadeReserva(-1));
        assertEquals(MESSAGE, ex.getMessage());
    }

    @Test
    void rejectsZeroQuantity() {
        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> new QuantidadeReserva(0));
        assertEquals(MESSAGE, ex.getMessage());
    }

    @Test
    void acceptsPositiveQuantity() {
        assertEquals(1, new QuantidadeReserva(1).valor());
        assertEquals(10, new QuantidadeReserva(10).valor());
    }
}
