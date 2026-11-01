package com.vsos.backend.exception.project;

import lombok.Getter;

@Getter
public class ProjectException extends RuntimeException {

    private final ProjectError error;

    public ProjectException(ProjectError error, Object... args) {
        super(error.getMessage().formatted(args));
        this.error = error;
    }
}
