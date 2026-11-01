package com.linhafarma.domain.reserva;

/**
 * Reservation quantity. Must always be greater than zero.
 */
public record QuantidadeReserva(int valor) {

    public QuantidadeReserva {
        if (valor <= 0) {
            throw new IllegalArgumentException("Reservation quantity must be greater than zero");
        }
    }
}
